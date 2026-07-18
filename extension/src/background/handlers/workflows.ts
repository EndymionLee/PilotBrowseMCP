/**
 * 工作流管理器 - 用户保存操作描述给 Agent
 *
 * 用户在弹窗中写下"在B站怎么搜索视频"的描述，
 * 保存到 Server 的 workflows/ 目录。
 * Agent 通过 workflow.list / workflow.get 查看，
 * 结合 website-manual 里的选择器自己执行。
 */
export async function saveWorkflow(name: string, description: string, url: string, title: string): Promise<void> {
  const key = `workflow_${Date.now()}`;
  await chrome.storage.local.set({
    [key]: { name, description, url, title, createdAt: new Date().toISOString() },
  });
}
