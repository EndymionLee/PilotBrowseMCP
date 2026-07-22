# 项目提示

## 操作手册优先

**操作已知站点前，先检查 `website-manuals/<site>/` 下是否有手册。**

- **有手册** --> 先读根目录 `README.md`，再按需加载具体文件
- **无手册** --> 走探索流程，保存到 `website-manuals/`

## 目录结构

```
website-manuals/<site>/
  README.md              # 根索引
  pages/                 # 页面元素（扁平）
  navigation/            # 导航路径（扁平）
  workflows/
    README.md            # 流程索引
    flows/               # workflow JSON
  apis/
    README.md            # API 索引（先读此文件）
    endpoints/           # API JSON
```

### 怎么用

1. **读根 README.md** -- 了解有什么可用
2. **查元素** -- 加载具体 `pages/<page>.json`
3. **走导航** -- 加载 `navigation/<from>-to-<to>.json`
4. **调 API** -- 先读 `apis/README.md` 看有哪些 API，再加载 `apis/endpoints/<name>.json`

## 执行优先级

1. **API 优先** -- API 可用时用 `browser_network_replay`
2. **浏览器兜底** -- API 失败时执行 workflow 步骤（click/type）
3. **重新探索** -- 两者都失败时重新探索并更新手册

API 和 workflow 是同一个能力的两种实现。API 更快更省，不行就兜底到浏览器。

## 用户录制与标记

用户说"发你了"、"看看"等时：

- `workflow_list_elements` -- 查看标记的元素
- `workflow_list_recordings` -- 查看录制的操作流程
