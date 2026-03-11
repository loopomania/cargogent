import asyncio
from app import extract_tracking

async def main():
    print("Testing 11463866703")
    res1 = await extract_tracking("11463866703")
    print(res1)
    
    print("\nTesting 11464169324")
    res2 = await extract_tracking("11464169324")
    print(res2)

if __name__ == "__main__":
    asyncio.run(main())
