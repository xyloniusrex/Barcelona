# Test Data

Sample ATD files for testing the Barcelona possession detection framework.

## Files

- `sample_atd.txt` - Sample tracking data (10 frames)
- `sample_atd.xml` - Sample metadata

## Format

### ATD Raw Data (`sample_atd.txt`)

```
<frame_id>:<player1_x,player1_y,speed>;<player2_x,player2_y,speed>:<ball_x,ball_y,speed>
```

Example:
```
1:0.5,0.5,0;0.4,0.4,0;0.6,0.6,0:0.55,0.55,0
```

- Frame 1 has 3 players at (0.5,0.5), (0.4,0.4), (0.6,0.6)
- Ball is at (0.55, 0.55)
- Player at (0.5,0.5) is closest to ball → Home possession

### ATD Metadata (`sample_atd.xml`)

Standard Metrica FbEPTS format with Team and Player definitions.

## Usage

```bash
# Test with sample data
barcelona process -i examples/sample_atd.txt -m examples/sample_atd.xml -o /tmp/test.csv -s 0

# Expected output: 199319 frames, first 10 have labels based on sample data
head -15 /tmp/test.csv
```
