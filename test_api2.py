import asyncio
from app import extract_tracking

async def main():
    print("Testing 11463866703")
    try:
        res1 = await extract_tracking("11463866703")
        print(res1)
    except Exception as e:
        print("Error on first:", e)
    
    print("\nTesting 11464169324")
    try:
        res2 = await extract_tracking("11464169324")
        print(res2)
    except Exception as e:
        print("Error on second:", e)

if __name__ == "__main__":
    asyncio.run(main())
