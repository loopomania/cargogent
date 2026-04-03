import sys
import asyncio
import os
sys.path.insert(0, os.path.abspath("AWBTrackers"))

from airlines.maman import MamanExportTracker
from airlines.swissport import SwissportExportTracker

awbs = [
    ("11463888580", "ISR10050434", "El Al"),
    ("16083499360", "ISR10051862", "Cathay"),
    ("70051238714", "ISR10046858", "Challenge"),
    ("50120080480", "ISR10048979", "Silk Way"),
    ("28124905215", "ISR10049343", "CargoBooking"),
    ("61566486733", "ISR10049530", "DHL Aviation"),
    ("01437618280", "ISR10047883", "Air Canada"),
    ("02001447633", "ISR10048075", "Lufthansa"),
    ("01656472942", "ISR10046959", "United"),
    ("07950741110", "ISR10047052", "CargoPal"),
    ("05700344746", "ISR10047053", "AFKLM (Air France)"),
    ("00638686476", "ISR10047246", "Delta"),
    ("07159722902", "ISR10047248", "Ethiopian"),
    ("07470833125", "AIR0228472", "AFKLM (KLM)")
]

async def check():
    for mawb, hawb, airline in awbs:
        mc = MamanExportTracker()
        sc = SwissportExportTracker()
        try:
            mw, mp, me = await mc.track_export(hawb, mawb)
            if mw is not None or me:
                print(f"{airline}: Maman")
                continue
        except Exception:
            pass
            
        try:
            sw, sp, se = await sc.track_export(mawb, hawb)
            if sw is not None or se:
                print(f"{airline}: Swissport")
                continue
        except Exception:
            pass
            
        print(f"{airline}: Unknown/None")

asyncio.run(check())
