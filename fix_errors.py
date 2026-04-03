import re
with open("frontend/src/components/MilestonePlan.tsx", "r") as f:
    text = f.read()

# Fix MilestoneNode
text = text.replace("code, desc, done, active, event", "code, label, desc, done, active, event")
# the type decl looks like: { code: string; label: string; desc: string; done: boolean; active: boolean; event?: TrackingEvent | null; }
# Where the code is rendered:
# <span style={{ ... }}>{code}</span>
# Replace {code} with {label} in that specific span.
text = re.sub(r'\}\)\{code\}</span>', '}){label}</span>', text)

# Remove side="right" in MilestoneNode calls
text = text.replace('side="right"', '')

# Remove unused imports and functions
text = text.replace('Truck, AlertTriangle, Shield, Package, ', '')
text = text.replace('AlertTriangle, ', '')

# Comment out unused functions
def comment_out_function(func_name, code):
    return re.sub(rf'function {func_name}\(.*?\)\s*{{.*?^}}', f'// unused: {func_name}', code, flags=re.MULTILINE | re.DOTALL)

# DatePair
text = re.sub(r'function DatePair\(\{.*?^}', '// unused: DatePair', text, flags=re.MULTILINE | re.DOTALL)
# getPresentMilestones
text = re.sub(r'function getPresentMilestones\(.*?\)\s*{{.*?^}', '// unused: getPresentMilestones', text, flags=re.MULTILINE | re.DOTALL)

with open("frontend/src/components/MilestonePlan.tsx", "w") as f:
    f.write(text)
