"""
同步 AGENTS-EN.md 到所有 agent-examples 目录。

用法：
    python scripts/sync-prompt.py

将 scripts/Prompt/AGENTS-EN.md 覆盖到各 agent 的项目提示词文件。
"""
import shutil
from pathlib import Path

SOURCE = Path("scripts/Prompt/AGENTS-EN.md")

# 每个 agent 目录对应的提示词文件名
AGENT_PROMPTS = [
    ("CCProjectDir",     ".claude/CLAUDE.md"),
    ("CodexProjectDir",  "AGENTS.md"),
    ("OpencodeProjectDir", "AGENTS.md"),
    ("PiProjectDir",     "AGENTS.md"),
]

def main():
    if not SOURCE.exists():
        print(f"[ERROR] 源文件不存在: {SOURCE}")
        return

    synced = 0
    for agent_dir, filename in AGENT_PROMPTS:
        target = Path("agent-examples") / agent_dir / filename
        if not target.parent.exists():
            print(f"[SKIP] 目录不存在: {target.parent}")
            continue
        shutil.copy2(SOURCE, target)
        print(f"[OK]   {target}")
        synced += 1

    print(f"\n完成: 已同步 {synced} 个文件")


if __name__ == "__main__":
    main()
