"""
同步 SKILL-EN.md 到所有 agent-examples 目录。

用法：
    python scripts/sync-skill.py

将 scripts/Skill/SKILL-EN.md 覆盖到各 agent 的 website-explorer/SKILL.md
"""
import shutil
from pathlib import Path

SOURCE = Path("scripts/Skill/SKILL-EN.md")
TARGET_PATTERN = "*/skills/website-explorer/SKILL.md"
AGENT_DIRS = [
    "CCProjectDir",
    "CodexProjectDir",
    "OpencodeProjectDir",
    "PiProjectDir",
]

def main():
    if not SOURCE.exists():
        print(f"[ERROR] 源文件不存在: {SOURCE}")
        return

    synced = 0
    for agent_dir in AGENT_DIRS:
        target = Path("agent-examples") / agent_dir / ".claude" / "skills" / "website-explorer" / "SKILL.md"
        if not target.exists():
            # 试其他路径格式（不同 agent 可能用不同目录名）
            for sub in [".codex", ".opencode", ".pi"]:
                alt = Path("agent-examples") / agent_dir / sub / "skills" / "website-explorer" / "SKILL.md"
                if alt.exists():
                    target = alt
                    break

        if not target.exists():
            print(f"[SKIP] 未找到: agent-examples/{agent_dir}/.../skills/website-explorer/SKILL.md")
            continue

        shutil.copy2(SOURCE, target)
        print(f"[OK]   {target}")
        synced += 1

    print(f"\n完成: 已同步 {synced} 个文件")


if __name__ == "__main__":
    main()
