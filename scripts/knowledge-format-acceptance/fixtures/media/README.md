# Media sentinel fixtures

These files contain the same synthetic spoken phrase twice:

```text
Spectra media fact four two.
```

The video variants use a solid-color frame and the same audio track. They contain no private or
third-party source material. The fixtures are intentionally short and small so Bailian can fetch a
committed immutable revision during the explicit live format gate.

The source audio was generated with macOS `say` (`Samantha`, rate 135), then encoded with FFmpeg
8.0.1. Video variants use a 640x360, 15 fps solid-color H.264/AAC master; legacy containers use
MPEG-4/MP3, FLV/MP3, or WMV2/WMA2 as required by the container.

| File | SHA-256 |
| --- | --- |
| `sentinel.aac` | `488510c88ca19e6fbd8cb83cfba53afaeea7b173a1d6357ae2e515adf6d738df` |
| `sentinel.avi` | `49656bb35f3cbd895cbdf9baa1ed647e464d7197296f4f3ea747d6cd9335bdf2` |
| `sentinel.flv` | `03ab1cff7ddf2fb2fdb5eb986d2b1ae6d8b2491e9f8a3abc92b98c82d9f88be9` |
| `sentinel.mkv` | `e9ea712a22a3e12127862bfdca6d9c20bf0c5c3bb2aa7e651260dac9a8625bff` |
| `sentinel.mov` | `935b0cb1c74be27cc1731422c841ec6a3c86339d5f641a4d9b4c557be45d48df` |
| `sentinel.mp3` | `07bb41365302c2bcc75ae1ca38267648fc777aff827b92f797ee94d574540b64` |
| `sentinel.mp4` | `8fdba0a1277e65fe826623bec2762b8da957d358e81401f4657c36a54e858ded` |
| `sentinel.wav` | `17cad6689a6194911659b1d772ae65e3f57c4936b9a8587bc8bb3341a21316fd` |
| `sentinel.wmv` | `e582b529461a484aa6f3fe9edc1fcdba9da20240f8f007d4d8a3f79d0bdfc388` |
