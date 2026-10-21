# barcelona

**Smol & efficient football possession detection from tracking data**

## Install

```bash
cargo install --git https://github.com/xyloniusrex/Barcelona barcelona
```

## Use

```bash
# Process ATD -> CSV
barcelona process -i data/atd.txt -m data/meta.xml -o possession.csv -s 50

# Validate
barcelona validate -i possession.csv
```

## Options

- `-s, --smooth`: Smoothing window (0=none, 25=1s, 50=2s, 125=5s)
- Default: 50 frames (= +/- 2 seconds at 25fps)

## Output

```csv
frame,label
0,X
1,X
...
199318,X
```

Labels: `H` (Home), `A` (Away), `D` (Dead), `X` (Unknown)

## Algorithm

1. For each frame with ball visible: nearest player to ball gets possession
2. No ball = Dead (D)
3. Smooth with majority vote over window
