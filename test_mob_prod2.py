import asyncio
from airlines.elal import ElAlTracker

async def test():
    tracker = ElAlTracker()
    print('Testing El Al with Mobile Emulation on PROD...')
    res = await tracker.track('11421805243')
    print('STATUS:', res.status)
    print('EVENTS:', len(res.events))
    print('TRACE:', res.raw_meta.get('trace'))

asyncio.run(test())
