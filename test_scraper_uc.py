import asyncio
from airlines.elal import ElAlTracker

proxy_url = 'http://scraperapi:646f8dc2df9803bd9f8275c7c3d3f165@proxy-server.scraperapi.com:8001'

async def test():
    tracker = ElAlTracker()
    tracker.proxy = proxy_url
    print('Testing El Al with ScraperAPI Proxy...')
    res = await tracker.track('11421805243')
    print('STATUS:', res.status)
    print('EVENTS:', len(res.events))
    print('MESSAGE:', res.message)
    print('TRACE:', res.raw_meta.get('trace'))

asyncio.run(test())
