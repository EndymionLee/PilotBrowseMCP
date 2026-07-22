"""
同步 SKILL-EN/ 目录到所有 agent-examples 目录。

用法：
    python scripts/sync-skill.py

将 scripts/Skill/SKILL-EN/ 目录（含所有子文件）覆盖到各 agent 的 website-explorer 技能目录。
"""
import shutil
from pathlib import Path

SOURCE = Path("scripts/Skill/SKILL-EN")

# 每个 agent 对应的技能目录路径
AGENT_SKILLS = [
    ("CCProjectDir",     ".claude/skills/website-explorer"),
    ("CodexProjectDir",  ".codex/skills/website-explorer"),
    ("OpencodeProjectDir", ".opencode/skills/website-explorer"),
    ("PiProjectDir",     ".pi/skills/website-explorer"),
]

def main():
    if not SOURCE.is_dir():
        print(f"[ERROR] 源目录不存在: {SOURCE}")
        return

    synced = 0
    for agent_dir, rel_path in AGENT_SKILLS:
        target = Path("agent-examples") / agent_dir / rel_path
        if not target.parent.exists():
            print(f"[SKIP] 目录不存在: {target}")
            continue

        # 删除旧内容，复制整个目录
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(SOURCE, target)
        print(f"[OK]   {target}")
        synced += 1

    print(f"\n完成: 已同步 {synced} 个目录")


if __name__ == "__main__":
    main()
