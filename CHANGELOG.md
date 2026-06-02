## [0.11.0](https://github.com/inference-gateway/infer-action/compare/v0.10.1...v0.11.0) (2026-06-02)

### Features

* add direct-prompt input for manual (workflow_dispatch) runs ([#46](https://github.com/inference-gateway/infer-action/issues/46)) ([834c913](https://github.com/inference-gateway/infer-action/commit/834c913aeb814058ac5799517b08e9b6ae7bd82f))

### Maintenance

* ignore node_modules in linters and raise markdown line length ([dbbbd85](https://github.com/inference-gateway/infer-action/commit/dbbbd85ded5136b94b00273c13d8c57230ac5899))
* remove redundant inline comment ([56a80fa](https://github.com/inference-gateway/infer-action/commit/56a80fad2595094316e2a65229a33cdf4ea9e5ae))

## [0.10.1](https://github.com/inference-gateway/infer-action/compare/v0.10.0...v0.10.1) (2026-06-02)

### Continuous Integration

* **deps:** update Infer CLI version v0.117.0 -> v0.117.1 ([7da3b31](https://github.com/inference-gateway/infer-action/commit/7da3b316af29237fe6a79ef23d3f0c9894ed90fb))

## [0.10.0](https://github.com/inference-gateway/infer-action/compare/v0.9.2...v0.10.0) (2026-06-02)

### Features

* show total tool calls and success rate in result footer ([#44](https://github.com/inference-gateway/infer-action/issues/44)) ([edc8211](https://github.com/inference-gateway/infer-action/commit/edc8211100191058d239e312296ecf5bb1e11f0d)), closes [#43](https://github.com/inference-gateway/infer-action/issues/43)

### Continuous Integration

* **infer:** centralize infer.yml + bump infer CLI and sync .infer config ([#42](https://github.com/inference-gateway/infer-action/issues/42)) ([02e1841](https://github.com/inference-gateway/infer-action/commit/02e184179c87506456fbe5f43e3c5b3679cc0400))

## [0.9.2](https://github.com/inference-gateway/infer-action/compare/v0.9.1...v0.9.2) (2026-06-01)

### Maintenance

* add claude.yml to prettier ignore file ([2d0f92a](https://github.com/inference-gateway/infer-action/commit/2d0f92a6e120c33d9fd2d3baad8bb04a9945a376))
* **deps:** bump infer cli default version 0.115.2 -> 0.117.0 ([ebbc67a](https://github.com/inference-gateway/infer-action/commit/ebbc67a3dd828a8b2049480d9da700a706f377fb))

### Continuous Integration

* centralize claude.yml via reusable workflow ([#35](https://github.com/inference-gateway/infer-action/issues/35)) ([96e6692](https://github.com/inference-gateway/infer-action/commit/96e66926128a0700ab55ccd6d697790de98750e3))
* centralize claude.yml via reusable workflow ([#36](https://github.com/inference-gateway/infer-action/issues/36)) ([8d0ab7c](https://github.com/inference-gateway/infer-action/commit/8d0ab7cc77ae95860a829ece1309c3247d2bbaf2))
* centralize claude.yml via reusable workflow ([#37](https://github.com/inference-gateway/infer-action/issues/37)) ([48b7e88](https://github.com/inference-gateway/infer-action/commit/48b7e88f5271bc14756e6dee34c0461fb8cf3ecb))
* centralize infer.yml + bump infer CLI and sync .infer config ([#40](https://github.com/inference-gateway/infer-action/issues/40)) ([a59e743](https://github.com/inference-gateway/infer-action/commit/a59e743a019a5e84b84d2739ae4a159cbed56b37))
* centralize infer.yml + sync .infer config ([#39](https://github.com/inference-gateway/infer-action/issues/39)) ([7f1bb71](https://github.com/inference-gateway/infer-action/commit/7f1bb71480e51270d079438ad9f13a315a510090))
* centralize infer.yml via reusable workflow ([#38](https://github.com/inference-gateway/infer-action/issues/38)) ([23f98df](https://github.com/inference-gateway/infer-action/commit/23f98df4a66ed7786129806f2c7735c91c2e138a))
* **claude:** standardize workflow + task-based branch prefix ([a81c4a1](https://github.com/inference-gateway/infer-action/commit/a81c4a11377f985df3caf141275efe73dbcffb84))

## [0.9.1](https://github.com/inference-gateway/infer-action/compare/v0.9.0...v0.9.1) (2026-05-30)

### Maintenance

* **deps:** bump infer cli version 0.115.1 -> 0.115.2 ([23c74cb](https://github.com/inference-gateway/infer-action/commit/23c74cb74433c0beecdf2756fdfccbfeb9143607))

## [0.9.0](https://github.com/inference-gateway/infer-action/compare/v0.8.0...v0.9.0) (2026-05-30)

### Features

* add per-session cost to result footer ([1dd6544](https://github.com/inference-gateway/infer-action/commit/1dd6544c194b56e88ec44548566e5423edb9b081))
* expand agent safe defaults and add credential redaction ([ed9c32a](https://github.com/inference-gateway/infer-action/commit/ed9c32a552291afdae0118d3e176945277271a9e))

## [0.8.0](https://github.com/inference-gateway/infer-action/compare/v0.7.1...v0.8.0) (2026-05-30)

### Features

* detect PR-comment context, modularize prompts as markdown, add overrides ([#34](https://github.com/inference-gateway/infer-action/issues/34)) ([30ff451](https://github.com/inference-gateway/infer-action/commit/30ff451f14813b1da7c7d174ce02ab44b55d06ba))

## [0.7.1](https://github.com/inference-gateway/infer-action/compare/v0.7.0...v0.7.1) (2026-05-29)

### Bug Fixes

* pass github-token to the skills install step ([#33](https://github.com/inference-gateway/infer-action/issues/33)) ([883567c](https://github.com/inference-gateway/infer-action/commit/883567cee05c386ad5ad465eef6eabedebc1afa4)), closes [inference-gateway/cli#556](https://github.com/inference-gateway/cli/issues/556)

### Maintenance

* **flox:** bump infer cli to latest ([d82e944](https://github.com/inference-gateway/infer-action/commit/d82e94408723b5f7ba0de451994605ea82c3ff6a))

## [0.7.0](https://github.com/inference-gateway/infer-action/compare/v0.6.3...v0.7.0) (2026-05-29)

### Features

* add moonshot provider ([#29](https://github.com/inference-gateway/infer-action/issues/29)) ([08c2953](https://github.com/inference-gateway/infer-action/commit/08c295313f368c018a5266c5009025f394a14336)), closes [cli#373](https://github.com/inference-gateway/cli/issues/373) [#27](https://github.com/inference-gateway/infer-action/issues/27)
* agent-owned PRs, token-usage footer, override/append bash whitelist ([#26](https://github.com/inference-gateway/infer-action/issues/26)) ([f09cac8](https://github.com/inference-gateway/infer-action/commit/f09cac8bbd7e07eb417484611e1bdcba4ef0c7fd))
* replace cooking GIF with CLI-matched spinner loading indicator ([#32](https://github.com/inference-gateway/infer-action/issues/32)) ([444e1a7](https://github.com/inference-gateway/infer-action/commit/444e1a7f185f8a5fde5265421997cc75f8ae5426)), closes [#28](https://github.com/inference-gateway/infer-action/issues/28) [#28](https://github.com/inference-gateway/infer-action/issues/28)

### Bug Fixes

* forward COHERE_API_KEY to the agent env ([#31](https://github.com/inference-gateway/infer-action/issues/31)) ([a228710](https://github.com/inference-gateway/infer-action/commit/a22871010b481e1f64caf7cee8f9c240e72b5642)), closes [#30](https://github.com/inference-gateway/infer-action/issues/30)

### Maintenance

* replace em dashes with normal dashes ([9921f71](https://github.com/inference-gateway/infer-action/commit/9921f71380deb2c4f39b9971a56f7930dda8682c))

## [0.6.3](https://github.com/inference-gateway/infer-action/compare/v0.6.2...v0.6.3) (2026-05-29)

### Maintenance

* **deps:** bump infer cli version 0.114.0 -> 0.115.0 ([2ac6763](https://github.com/inference-gateway/infer-action/commit/2ac6763bb85b7c16fd851c8ea4c06f855287c249))

## [0.6.2](https://github.com/inference-gateway/infer-action/compare/v0.6.1...v0.6.2) (2026-05-29)

### Continuous Integration

* **release:** add missing ci and refactor prefixes ([988007b](https://github.com/inference-gateway/infer-action/commit/988007b11b4d770552560d388dcb1c4d253a1a36))

### Refactoring

* use bot id if available ([27abb12](https://github.com/inference-gateway/infer-action/commit/27abb1291304061a290c4c42426fdeacb60108db))

## [0.6.1](https://github.com/inference-gateway/infer-action/compare/v0.6.0...v0.6.1) (2026-05-29)

### Maintenance

* **deps:** bump infer cli version 0.113.0 -> 0.114.0 and reduce percentage for auto compact ([8f7ee26](https://github.com/inference-gateway/infer-action/commit/8f7ee26ab0e58d295e83ae91207057e2daf7f9c1))

## [0.6.0](https://github.com/inference-gateway/infer-action/compare/v0.5.1...v0.6.0) (2026-05-29)

### Features

* add debug and compact inputs ([#25](https://github.com/inference-gateway/infer-action/issues/25)) ([7ecc24d](https://github.com/inference-gateway/infer-action/commit/7ecc24dfd9396ac1433a2dbc67712a85b1b35677))

### Maintenance

* **deps:** bump default version of the cli to latest 0.113.0 ([6869569](https://github.com/inference-gateway/infer-action/commit/6869569af5f81d7ec117767b3dc1806558606d37))
* **deps:** bump inference-gateway/infer-action ([#23](https://github.com/inference-gateway/infer-action/issues/23)) ([5230c00](https://github.com/inference-gateway/infer-action/commit/5230c009eef8ae67c84114159d1fcee5b29905b6))

## [0.6.0-rc.3](https://github.com/inference-gateway/infer-action/compare/v0.6.0-rc.2...v0.6.0-rc.3) (2026-05-28)

### Bug Fixes

* **prompt:** require branch-first push and commit-per-todo, with periodic reminder ([#22](https://github.com/inference-gateway/infer-action/issues/22)) ([fe7ecbe](https://github.com/inference-gateway/infer-action/commit/fe7ecbe75a4978245647c2f14515da87e21fdf04)), closes [typescript-adk#48](https://github.com/inference-gateway/typescript-adk/issues/48)

### Maintenance

* replace em dashes with regular dashes ([bb8bb21](https://github.com/inference-gateway/infer-action/commit/bb8bb21afe79deffff1318471d540f62c22d9e56))

## [0.6.0-rc.2](https://github.com/inference-gateway/infer-action/compare/v0.6.0-rc.1...v0.6.0-rc.2) (2026-05-28)

### Maintenance

* **deps:** bump infer cli default version v0.112.2 -> v0.112.3 ([3bf4648](https://github.com/inference-gateway/infer-action/commit/3bf4648587431d569bc5357a8e4059458b141d91))

## [0.6.0-rc.1](https://github.com/inference-gateway/infer-action/compare/v0.5.0...v0.6.0-rc.1) (2026-05-28)

### Features

* replace dogfood workflow with use-mock-agent action input ([bbc81d3](https://github.com/inference-gateway/infer-action/commit/bbc81d306165580cfb678adbc01caffcc847db41))
* rewrite agent runner and post-results as TypeScript hot path ([0b4bfa7](https://github.com/inference-gateway/infer-action/commit/0b4bfa7c4af6bfa33988b4a5e8476cae9cbb28ce))
## [0.5.1](https://github.com/inference-gateway/infer-action/compare/v0.5.0...v0.5.1) (2026-05-28)

### Bug Fixes

* use the same comment for a workflow ([a5210cb](https://github.com/inference-gateway/infer-action/commit/a5210cbcf27328344bc8c964dd32d153a1f57b04))

### Maintenance

* **build:** drop sourcemaps from dist bundles ([48ee0a4](https://github.com/inference-gateway/infer-action/commit/48ee0a4fa4d139e009a766711cf4d590f8b8f900))
* **release:** enable rc prerelease branch ([daf3949](https://github.com/inference-gateway/infer-action/commit/daf3949cbf8bb2d19665a6bb5e7b9957e061115e))

## [0.5.0](https://github.com/inference-gateway/infer-action/compare/v0.4.0...v0.5.0) (2026-05-28)

### Features

* **skills:** add the option to install skills ([1e9abab](https://github.com/inference-gateway/infer-action/commit/1e9ababb3f83b7242760c8af39ece7d2ecbe7cc9))
* Use any model dynamically for a task ([b26350f](https://github.com/inference-gateway/infer-action/commit/b26350fd3de8689aa2a3a80ce20ce04a5d0a4762))
* **workflow:** Add cooking message with animated GIF ([7a202f7](https://github.com/inference-gateway/infer-action/commit/7a202f78c0fbf4f49af8f062e89344448395e768)), closes [#12](https://github.com/inference-gateway/infer-action/issues/12)

### Bug Fixes

* **ci:** only trigger infer when actually needed ([bdfbe2f](https://github.com/inference-gateway/infer-action/commit/bdfbe2f6f97d105859ade66a33bbb972c87acffa))
* Regex for capturing the model name ([0de861b](https://github.com/inference-gateway/infer-action/commit/0de861bfffa790e71895fc34fa52d2ce5f7d4b95))
* Skip bot comments and prevent duplicate cooking messages ([efc1e89](https://github.com/inference-gateway/infer-action/commit/efc1e893a23716df8efc4d689523607f2ba94b32))
* **system-prompt:** Add branch checking logic to prevent multiple PRs ([#14](https://github.com/inference-gateway/infer-action/issues/14)) ([8d06b91](https://github.com/inference-gateway/infer-action/commit/8d06b9198f2dcc61164373aceb81f20f20ffac88))

### Documentation

* Add AGENTS.md and update existing documentation ([321743b](https://github.com/inference-gateway/infer-action/commit/321743b15911caae7175867fbd052fa859ce577a))
* Add CLAUDE.md file ([a426ab7](https://github.com/inference-gateway/infer-action/commit/a426ab7f7bc645198a8d519cd510758aec089374))
* Regenerate AGENTS.md with codex ([262b583](https://github.com/inference-gateway/infer-action/commit/262b5839d4025ba45000e67c69efd64b8d3553d1))
* Regenerate CLAUDE.md ([24a4d37](https://github.com/inference-gateway/infer-action/commit/24a4d37ca9ecb68f77fc02108aaac507fd12ca16))

### Maintenance

* Add concurrency control to cancel outdated workflow runs ([bb8f4e6](https://github.com/inference-gateway/infer-action/commit/bb8f4e6c552d3c5c9cb733a05ea6f963e1feb8ae))
* Create LICENSE ([82b6ea0](https://github.com/inference-gateway/infer-action/commit/82b6ea097f6e1ca65b3397ba402d15c1c29d7150))
* Delete AGENTS.md ([88e30ce](https://github.com/inference-gateway/infer-action/commit/88e30ce1f71b7d9230a1623b29ef1346dc2ff733))
* **deps:** Add codex and bump infer CLI ([beb2ce6](https://github.com/inference-gateway/infer-action/commit/beb2ce6349d9993bb184fdad61a5b78d9729f135))
* **deps:** Bump dev development dependencies ([186f568](https://github.com/inference-gateway/infer-action/commit/186f568376d28b9e45efbba30458ce730e886e16))
* **deps:** bump infer cli default version to latest ([0039be0](https://github.com/inference-gateway/infer-action/commit/0039be0bfc66cf0024e3bd2187756c3c1adefa5e))
* **deps:** Update infer.flake to v0.109.11 ([6979ccb](https://github.com/inference-gateway/infer-action/commit/6979ccbb3452b55a6eacac5f5159a0932b2638bf))
* **deps:** Upgrade dev dependencies ([ab2702e](https://github.com/inference-gateway/infer-action/commit/ab2702e1274ba0d8fb4535d6935b75e2d537549d))
* **deps:** Upgrade dev dependencies ([0cbe33c](https://github.com/inference-gateway/infer-action/commit/0cbe33c6adc52df9e3138c90b93a5fc472326ef1))
* **docs:** Generate AGENTS.md file ([bc468b2](https://github.com/inference-gateway/infer-action/commit/bc468b2057daae42dff0fad9931d1e42ad485bb3))
* **flox:** Bump schema version ([94c5fcc](https://github.com/inference-gateway/infer-action/commit/94c5fcc0d74f9bdd4f94ba1005d3381ff313a712))
* Generate CLAUDE.md file ([f58da06](https://github.com/inference-gateway/infer-action/commit/f58da063936f189042a50422077bda4396f3cea4))
* **license:** Update license to Apache 2.0 ([6bbb381](https://github.com/inference-gateway/infer-action/commit/6bbb381893809eed40715a87cd0a98c1fd036a7b))
* Remove CLAUDE.md file ([a3d652f](https://github.com/inference-gateway/infer-action/commit/a3d652f540ba7126fcf4e4182043588895c1186b))
* Remove outdated issue templates for bug reports, feature requests, and refactor requests ([efd0ace](https://github.com/inference-gateway/infer-action/commit/efd0ace7cc84df96cce538f07119bff1f0f8da9e))
* Replace em dashes with normal dashes ([b640e9c](https://github.com/inference-gateway/infer-action/commit/b640e9ca66a52baec9522c1194de15259282ad59))
* Update model in infer.yml workflow ([ba113ab](https://github.com/inference-gateway/infer-action/commit/ba113ab1e66198793530d812f3a22f9269f43729))
* Use qwen3-coder by default ([1a79173](https://github.com/inference-gateway/infer-action/commit/1a79173d774f0b1c6f1169636fbdfbb66ff23a05))
* Use transparent gif ([199a75a](https://github.com/inference-gateway/infer-action/commit/199a75a942b1571d7951a57880bc33e09628b52a))

## [0.4.0](https://github.com/inference-gateway/infer-action/compare/v0.3.1...v0.4.0) (2025-11-28)

### Features

* **ci:** Setup infer workflow ([#11](https://github.com/inference-gateway/infer-action/issues/11)) ([c771646](https://github.com/inference-gateway/infer-action/commit/c77164607f1ec061100a7fa242f9b17c433dc1b8))
* **ci:** Setup infer workflow ([#9](https://github.com/inference-gateway/infer-action/issues/9)) ([4cc6311](https://github.com/inference-gateway/infer-action/commit/4cc63110a57b16b4f83bf5240a0e75794cd02921))

## [0.3.1](https://github.com/inference-gateway/infer-action/compare/v0.3.0...v0.3.1) (2025-11-26)

### Bug Fixes

* Properly escape GitHub event data in bash scripts ([48e8df7](https://github.com/inference-gateway/infer-action/commit/48e8df7a4709d36aca7d5877d1c2a3b5065f0955))
* Refactor failed tool call detection to use JSON parsing ([#6](https://github.com/inference-gateway/infer-action/issues/6)) ([562cb64](https://github.com/inference-gateway/infer-action/commit/562cb64c686f6d9f5f20e56b0160130e89a89421)), closes [#5](https://github.com/inference-gateway/infer-action/issues/5)
* **workflow:** Update system prompt to follow conventional commit format ([#8](https://github.com/inference-gateway/infer-action/issues/8)) ([efe0b62](https://github.com/inference-gateway/infer-action/commit/efe0b62860e12f589e2bf6cfa1213386a6ffecfe))

### Documentation

* Update model provider in README ([90a236b](https://github.com/inference-gateway/infer-action/commit/90a236b26d34cea244f2d59162c8882953fc795e))

### Maintenance

* Update version ([4429ff2](https://github.com/inference-gateway/infer-action/commit/4429ff204bb3abd31026b112ac6eb16285b5a7b7))

## [0.3.0](https://github.com/inference-gateway/infer-action/compare/v0.2.0...v0.3.0) (2025-11-26)

### Features

* Implement enable-git-operations and set it to true by default ([07c1b9e](https://github.com/inference-gateway/infer-action/commit/07c1b9e1eec5b6072bef46f32e615dc48cf1f4a3))

### Maintenance

* Adjust infer workflow ([38f6ffd](https://github.com/inference-gateway/infer-action/commit/38f6ffd5ac5c34a45bfa955d7cc9d6f7f793352e))
* **deps:** Bump the cli version to 0.68.4 ([6817cee](https://github.com/inference-gateway/infer-action/commit/6817cee2cdbb364beb2207945d925d6e38a87c48))
* **deps:** Bump the version of infer ([fa25f30](https://github.com/inference-gateway/infer-action/commit/fa25f300869dbc0368a0e0d0c25efe64f7a59578))

## [0.2.0](https://github.com/inference-gateway/infer-action/compare/v0.1.4...v0.2.0) (2025-11-26)

### Features

* Add bash whitelist configuration support ([30bf4ac](https://github.com/inference-gateway/infer-action/commit/30bf4acfb6d4a5d9bf24f7f2bf1b1c693740711c))
* Add PR workflow and custom instructions support ([a96b079](https://github.com/inference-gateway/infer-action/commit/a96b0794cfaa918b11bc97ebf7ce9f527c6e7f91))

## [0.1.4](https://github.com/inference-gateway/infer-action/compare/v0.1.3...v0.1.4) (2025-11-26)

### Bug Fixes

* Make action fail when agent exits with non-zero ([e1142db](https://github.com/inference-gateway/infer-action/commit/e1142dbc0b1d4bc6f9805df95c64788ac11fa8f5))

## [0.1.3](https://github.com/inference-gateway/infer-action/compare/v0.1.2...v0.1.3) (2025-11-26)

### Bug Fixes

* **docs:** Correct the links ([b8b81e6](https://github.com/inference-gateway/infer-action/commit/b8b81e6fa2a9b88e8aab250c4895d09f20290539))

### Documentation

* Improve README.md ([335d67d](https://github.com/inference-gateway/infer-action/commit/335d67d56a76ad5c5f2fac5f16381ff78267ff89))

### Maintenance

* Add github issue templates ([1014a4c](https://github.com/inference-gateway/infer-action/commit/1014a4cd80d48eb9233536e9488820c30aa10695))
* Fix markdown lint issues ([c024a32](https://github.com/inference-gateway/infer-action/commit/c024a325413642ef187651f3394f0e87763f07a0))

## [0.1.2](https://github.com/inference-gateway/infer-action/compare/v0.1.1...v0.1.2) (2025-11-26)

### Maintenance

* Update default Infer CLI version to v0.68.2 ([ce438ef](https://github.com/inference-gateway/infer-action/commit/ce438efa8dc760e4c80aa1fff0d9f37d36deebb1))

## [0.1.1](https://github.com/inference-gateway/infer-action/compare/v0.1.0...v0.1.1) (2025-11-26)

### Documentation

* Update action version in README ([c3a511b](https://github.com/inference-gateway/infer-action/commit/c3a511b4ca9999337b997d600f790523da0827f1))
