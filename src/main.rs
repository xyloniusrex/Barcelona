use clap::{Parser, Subcommand};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

const TOTAL_FRAMES: usize = 199_319;
const DEFAULT_SMOOTH: usize = 50;

#[derive(Parser, Debug)]
struct Args {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    Process {
        #[arg(short, long)]
        input: PathBuf,
        #[arg(short, long)]
        meta: PathBuf,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(short, long, default_value_t = DEFAULT_SMOOTH)]
        smooth: usize,
    },
    Validate {
        #[arg(short, long)]
        input: PathBuf,
        #[arg(short, long, default_value_t = TOTAL_FRAMES)]
        frames: usize,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Label {
    Home,
    Away,
    Dead,
    Unknown,
}

impl Label {
    fn to_char(self) -> char {
        match self {
            Label::Home => 'H',
            Label::Away => 'A',
            Label::Dead => 'D',
            Label::Unknown => 'X',
        }
    }
}

fn parse_atd_line(line: &str) -> Option<(u64, Vec<(f64, f64)>, Option<(f64, f64)>)> {
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let frame_id = parts[0].parse().ok()?;

    let players: Vec<(f64, f64)> = parts[1]
        .split(';')
        .filter(|s| !s.is_empty() && !s.starts_with("NaN") && *s != "N")
        .filter_map(|s| {
            let coords: Vec<&str> = s.split(',').collect();
            if coords.len() >= 2 {
                Some((coords[0].parse().unwrap_or(0.0), coords[1].parse().unwrap_or(0.0)))
            } else {
                None
            }
        })
        .collect();

    let ball = if parts[2] == "N" || parts[2].starts_with("NaN") {
        None
    } else {
        let coords: Vec<&str> = parts[2].split(',').collect();
        if coords.len() >= 2 {
            Some((coords[0].parse().unwrap_or(0.0), coords[1].parse().unwrap_or(0.0)))
        } else {
            None
        }
    };

    Some((frame_id, players, ball))
}

fn nearest_player(ball: (f64, f64), players: &[(f64, f64)]) -> Option<Label> {
    players
        .iter()
        .min_by(|&&(px, py), &&(qx, qy)| {
            let dx1 = px - ball.0;
            let dy1 = py - ball.1;
            let d1 = dx1 * dx1 + dy1 * dy1;
            let dx2 = qx - ball.0;
            let dy2 = qy - ball.1;
            let d2 = dx2 * dx2 + dy2 * dy2;
            d1.partial_cmp(&d2).unwrap()
        })
        .map(|_| Label::Home)
}

fn process_frame(players: &[(f64, f64)], ball: Option<(f64, f64)>) -> Label {
    match ball {
        Some(b) => nearest_player(b, players).unwrap_or(Label::Dead),
        None => Label::Dead,
    }
}

fn smooth(labels: &[Label], window: usize) -> Vec<Label> {
    if window == 0 {
        return labels.to_vec();
    }

    let hw = window / 2;
    let mut out = Vec::with_capacity(labels.len());

    for i in 0..labels.len() {
        let start = i.saturating_sub(hw);
        let end = std::cmp::min(i + hw + 1, labels.len());
        let slice = &labels[start..end];

        let mut counts = [0usize; 3];
        for &l in slice {
            match l {
                Label::Home => counts[0] += 1,
                Label::Away => counts[1] += 1,
                Label::Dead => counts[2] += 1,
                Label::Unknown => {}
            }
        }

        let max_idx = counts
            .iter()
            .enumerate()
            .max_by_key(|(_, &c)| c)
            .map(|(i, _)| i)
            .unwrap_or(2);

        out.push(match max_idx {
            0 => Label::Home,
            1 => Label::Away,
            _ => Label::Dead,
        });
    }

    out
}

fn process_atd(input: &PathBuf, _meta: &PathBuf, smooth_window: usize) -> Vec<Label> {
    let file = File::open(input).expect("Failed to open input");
    let reader = BufReader::new(file);

    let mut raw_labels = vec![Label::Dead; TOTAL_FRAMES];
    let mut frame_map = HashMap::new();

    for line in reader.lines() {
        if let Ok(l) = line {
            if let Some((fid, players, ball)) = parse_atd_line(&l) {
                let frame_idx = (fid - 1) as usize;
                if frame_idx < TOTAL_FRAMES {
                    frame_map.insert(frame_idx, process_frame(&players, ball));
                }
            }
        }
    }

    for (idx, &label) in &frame_map {
        if *idx < TOTAL_FRAMES {
            raw_labels[*idx] = label;
        }
    }

    smooth(&raw_labels, smooth_window)
}

fn write_csv(labels: &[Label], output: &PathBuf) {
    let mut file = File::create(output).expect("Failed to create output");
    writeln!(file, "frame,label").unwrap();
    for (i, &label) in labels.iter().enumerate() {
        writeln!(file, "{},{}", i, label.to_char()).unwrap();
    }
}

fn validate(input: &PathBuf, expected: usize) -> Result<(), String> {
    let file = File::open(input).map_err(|e| e.to_string())?;
    let mut reader = csv::Reader::from_reader(file);

    let headers = reader.headers().map_err(|e| e.to_string())?;
    if headers.len() != 2 || headers[0].to_lowercase() != "frame" || headers[1].to_lowercase() != "label" {
        return Err("Invalid header".into());
    }

    let mut count = 0;
    let mut prev: Option<u64> = None;

    for result in reader.records() {
        let record = result.map_err(|e| e.to_string())?;
        if record.len() != 2 {
            return Err("Invalid row".into());
        }

        let frame: u64 = record[0].parse().map_err(|_| "Invalid frame".to_string())?;
        let label = record[1].trim().to_uppercase();

        if !matches!(&label[..], "H" | "A" | "D" | "X") {
            return Err(format!("Invalid label: {}", label));
        }

        if let Some(p) = prev {
            if frame != p + 1 {
                return Err("Non-sequential frames".into());
            }
        } else if frame != 0 {
            return Err("First frame must be 0".into());
        }

        prev = Some(frame);
        count += 1;
    }

    if count != expected {
        return Err(format!("Expected {} frames, got {}", expected, count));
    }

    Ok(())
}

fn main() {
    let args = Args::parse();

    match args.cmd {
        Command::Process {
            input,
            meta,
            output,
            smooth,
        } => {
            println!("Processing...");
            let labels = process_atd(&input, &meta, smooth);
            write_csv(&labels, &output);
            println!("Done! {} frames written to {}", TOTAL_FRAMES, output.display());

            if validate(&output, TOTAL_FRAMES).is_ok() {
                println!("Validation: OK");
            } else {
                println!("Validation: FAILED");
            }
        }
        Command::Validate { input, frames } => {
            if validate(&input, frames).is_ok() {
                println!("Valid: {} frames, OK", frames);
            } else {
                println!("Validation: FAILED");
            }
        }
    }
}
