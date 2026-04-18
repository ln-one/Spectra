# Spectra 送审稿接手说明

## 当前目标

当前工作面已经切回正文与结构，不再继续做封面美化实验。

本稿当前目标只有三项：

1. 维持 `11` 章目录稳定；
2. 按块继续做事实核对和文风收口；
3. 保持导出链稳定，不让封面、目录、图位和装饰层污染正文。

## 当前稳定结论

- 封面当前采用稳定版左上品牌区：
  - 小 logo
  - `Spectra`
  - `教学场景资料管理与内容生成系统`
- 封面不再使用背景装饰，也不再使用封底装饰。
- `CompoundBreaker` 的两处超大文件已经拆分：
  - `src/doc_engine/word_pipeline.py`
  - `src/doc_engine/importer.py`
- 长章已进一步拆块：
  - `01/02/03/08/09/10/11` 已改为目录章
- 文风禁令已写入：
  - `tone-balance-guide.md`
  - `writing-method.md`
- 当前禁止继续写入的解释腔包括：
  - `不是为了……而是为了……`
  - `重点不在……而在……`
  - `本节的重点……`
  - `这里需要证明的是……`
  - `如果进一步展开……`
  - `更直白地说……`
  - `从作品角度看……`

## 接手顺序

建议按以下顺序继续：

1. 先读：
   - [README.md](README.md)
   - [writing-method.md](writing-method.md)
   - [tone-balance-guide.md](tone-balance-guide.md)
   - [recovery-map.md](recovery-map.md)
2. 再看正文源：
   - [source/](source)
3. 若要改导出链，只动：
   - [word/](../../CompoundBreaker/src/doc_engine/word)
   - [importing/](../../CompoundBreaker/src/doc_engine/importing)

## 当前最值得继续做的事

### 1. 正文事实核对

优先检查：

- `05-系统设计/*`
- `06-核心技术/*`
- `07-项目测试与成果展示/*`

重点不是继续扩写，而是：

- 判断句是否直接；
- 证据是否贴页面、流程、接口、测试；
- 图题与正文是否一致。

### 2. 全书语气拉齐

优先扫：

- `01-前言/`
- `02-项目综述/`
- `11-结语/`

目标是与 `05/06/07` 形成统一语气，不回到解释稿或汇报稿。

### 3. 导出回归验证

每次改动后至少做：

1. `python3 -m py_compile <changed_python_files>`
2. `python3 ../../../backend/scripts/architecture_guard.py`
3. 重建：
   - `build-doc ...`
4. 检查 merged 稿中的禁用句法

## 当前明确不要再做的事

- 不再做封面背景实验；
- 不再把封面 logo 改回中央主视觉；
- 不再恢复封底装饰；
- 不再把学校、团队编号、手机号、邮箱等信息带回正文；
- 不再在单文件大章上硬改；
- 不再用“把不是……而是……改几个字”的方式假装完成文风清理。

## 当前产物

- 正式导出稿：
  - [spectra-v11-draft.docx](build/spectra-v11-draft.docx)
- 合并稿：
  - [spectra-v11-draft.merged.md](build/spectra-v11-draft.merged.md)
