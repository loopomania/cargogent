import asyncio
from awbtrackers.airlines.aircanada import AirCanadaTracker
from awbtrackers.airlines.maman import MamanGroundTracker

async def main():
    ac = AirCanadaTracker()
    print("Air Canada:")
    w, p, evs, hw, meth = await ac.track("ISR10055923", "01437625582")
    for ev in evs:
        print(ev)

asyncio.run(main())
