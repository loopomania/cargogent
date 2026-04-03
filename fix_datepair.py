with open("frontend/src/components/MilestonePlan.tsx", "r") as f:
    text = f.read()

# DatePair starts at "// ─── DatePair" and ends before "// ─── Build legs"
import re
text = re.sub(r'// ─── DatePair sub-component ─────────────────────────────────────────────────────.*?// ─── Build legs', '// ─── Build legs', text, flags=re.MULTILINE|re.DOTALL)

# getPresentMilestones starts at // ─── Get present milestones
text = re.sub(r'// ─── Get present milestones in order ───────────────────────────────────────────.*?// ─── Milestone node', '// ─── Milestone node', text, flags=re.MULTILINE|re.DOTALL)

with open("frontend/src/components/MilestonePlan.tsx", "w") as f:
    f.write(text)
