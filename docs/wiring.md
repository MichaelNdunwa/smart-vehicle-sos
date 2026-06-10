# Wiring Diagram

Initial prototype wiring:

| Component | Arduino Pin | Notes |
| --- | --- | --- |
| SOS button | D2 | Uses `INPUT_PULLUP`; connect button between D2 and GND. |
| Status LED | D13 | Built-in LED on many Arduino boards. |
| SIM808 TX | Arduino RX | Use level shifting if required by the selected board. |
| SIM808 RX | Arduino TX | Use level shifting if required by the selected board. |
| SIM808 GND | GND | Common ground is required. |
| SIM808 VCC | External supply | Use a stable supply sized for GSM current bursts. |

```text
GND ---- [ SOS Button ] ---- D2
D13 ---- [ Status LED / Built-in LED ]
SIM808 TX ------------------- Arduino RX
SIM808 RX ------------------- Arduino TX
SIM808 GND ------------------ GND
```
