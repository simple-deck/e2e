# [2.2.0](https://github.com/simple-deck/e2e/compare/v2.1.0...v2.2.0) (2022-01-28)


### Features

* **suite-runner:** :white_check_mark: add tests for suite runner ([6e4236e](https://github.com/simple-deck/e2e/commit/6e4236e37f9d7812c1fadc859569e76e6a72dd63)), closes [#11](https://github.com/simple-deck/e2e/issues/11)

# [2.1.0](https://github.com/simple-deck/e2e/compare/v2.0.3...v2.1.0) (2022-01-24)


### Features

* :children_crossing: make shared data more usable ([f055ee6](https://github.com/simple-deck/e2e/commit/f055ee6f775a3eafaafcf9fee1e0ad5cf232f729)), closes [#9](https://github.com/simple-deck/e2e/issues/9)

## [2.0.3](https://github.com/simple-deck/e2e/compare/v2.0.2...v2.0.3) (2022-01-24)


### Bug Fixes

* **suite-runner:** :bug: only log file matches on main thread ([5f19c4e](https://github.com/simple-deck/e2e/commit/5f19c4ef563684bd85488ccf95463a233d724d5a)), closes [#5](https://github.com/simple-deck/e2e/issues/5)

## [2.0.2](https://github.com/simple-deck/e2e/compare/v2.0.1...v2.0.2) (2022-01-18)


### Bug Fixes

* **suite-runner:** :bug: properly handle suite errors ([f8fa6ec](https://github.com/simple-deck/e2e/commit/f8fa6ec747b7b48c852ae14c5e2df1870f32ddb0))

## [2.0.1](https://github.com/simple-deck/e2e/compare/v2.0.0...v2.0.1) (2022-01-18)


### Bug Fixes

* **suite-runner:** :bug: ensure storage is respected and cleared ([08ab263](https://github.com/simple-deck/e2e/commit/08ab263d347aae95e00ba9ab837fe4dea475ee60))

# [2.0.0](https://github.com/simple-deck/e2e/compare/v1.3.3...v2.0.0) (2022-01-18)


### Bug Fixes

* **suite-runner:** :bug: deprecates concurrect suites ([da6602f](https://github.com/simple-deck/e2e/commit/da6602f0cfcff937ae114059f085b13984efcf46))
* **suite-runner-worker:** screenshot on error ([4d6abc4](https://github.com/simple-deck/e2e/commit/4d6abc4670e9895cfb58c63eafa74cf9586a0fae))


### Features

* add support for caching results ([2492651](https://github.com/simple-deck/e2e/commit/24926512e530a5a9b8b86001afaaab145f46f60b))


### BREAKING CHANGES

* **suite-runner:** concurrent suites are deprecated

## [1.3.3](https://github.com/simple-deck/e2e/compare/v1.3.2...v1.3.3) (2021-09-23)


### Bug Fixes

* **suite-runner-worker:** :bug: ensures undefined is coalesced to null ([8703379](https://github.com/simple-deck/e2e/commit/8703379084db872afe1e90b1498bdae5fe6d241c))

## [1.3.2](https://github.com/simple-deck/e2e/compare/v1.3.1...v1.3.2) (2021-09-23)


### Bug Fixes

* log result parse error ([e842b44](https://github.com/simple-deck/e2e/commit/e842b445ffbf88a40d9828b0fbb58ee78558a734))

## [1.3.1](https://github.com/simple-deck/e2e/compare/v1.3.0...v1.3.1) (2021-09-08)


### Bug Fixes

* **results processor:** :bug: exports processor enum ([d985450](https://github.com/simple-deck/e2e/commit/d985450deb03d4433e399642d9b957611623c242))
* **results processor:** :bug: write junit timings in seconds ([b2698ba](https://github.com/simple-deck/e2e/commit/b2698bade48836bd8522755432fdbc323b2dc35b))

# [1.3.0](https://github.com/simple-deck/e2e/compare/v1.2.0...v1.3.0) (2021-09-08)


### Features

* add new test results processor ([f273181](https://github.com/simple-deck/e2e/commit/f2731817a27318eb4c94fd5f8cbc799cb68c8dfb))

# [1.2.0](https://github.com/simple-deck/e2e/compare/v1.1.2...v1.2.0) (2021-09-08)


### Bug Fixes

* accommodate playwright upgrade ([0e220b1](https://github.com/simple-deck/e2e/commit/0e220b13d8e66594e6f25974d4ddb1fa4bdaabcd))
* add a few comments ([84ae7c8](https://github.com/simple-deck/e2e/commit/84ae7c861d778e3ec4b82924291da0d1fdfca133))
* exclude sudo ([e88e8e4](https://github.com/simple-deck/e2e/commit/e88e8e41b6f32d35f62d4acd7bf62307a5d38479))
* **samples:** :bug: correct assertion for main page sample ([f90cf28](https://github.com/simple-deck/e2e/commit/f90cf2881dfe5c2ceb678894036d0424ff680c69))


### Features

* **core suite:** :sparkles: add new CoreSuite method to structure test suites ([94cdfe9](https://github.com/simple-deck/e2e/commit/94cdfe98a1df3b859c2463e60199c26eb81eb770))
* **samples:** :sparkles: add new samples ([eac2b92](https://github.com/simple-deck/e2e/commit/eac2b925a321e65a56c255777e7a77e3f6ea2a9e))
* :arrow_up: upgrades playwright to 1.14 ([a520fa9](https://github.com/simple-deck/e2e/commit/a520fa97bd2ec0d826d0f676bda99db56e5227b0))

## [1.1.2](https://github.com/simple-deck/e2e/compare/v1.1.1...v1.1.2) (2021-08-06)


### Bug Fixes

* move playwright to peer dependencies ([4282253](https://github.com/simple-deck/e2e/commit/428225311d40bed2d0ce65c7883a23825e7c5cd1))

## [1.1.1](https://github.com/simple-deck/e2e/compare/v1.1.0...v1.1.1) (2021-07-22)


### Bug Fixes

* add better error handling ([a551ad6](https://github.com/simple-deck/e2e/commit/a551ad672a0553c19c204b3aed2e45205e69b70a))
* exit process on error ([c9fda2f](https://github.com/simple-deck/e2e/commit/c9fda2ff7cf306bd81a15c7f400ace5885b19664))

# [1.1.0](https://github.com/simple-deck/e2e/compare/v1.0.1...v1.1.0) (2021-07-22)


### Bug Fixes

* **base suite:** :green_heart: fixes imports for build ([dd08e6c](https://github.com/simple-deck/e2e/commit/dd08e6cc70e5252d9d43c6c73a066a3c43e18ee4))


### Features

* add new screenshot functionality ([c4934f4](https://github.com/simple-deck/e2e/commit/c4934f4514bbbbb7b5013eb5ede4716efd74f1ad))

## [1.0.1](https://github.com/simple-deck/e2e/compare/v1.0.0...v1.0.1) (2021-07-22)


### Bug Fixes

* bump version ([310a602](https://github.com/simple-deck/e2e/commit/310a6024a9746fcc30a81ecbe297f4cb513ca7fb))

# 1.0.0 (2021-07-22)


### Features

* first commit ([4b02819](https://github.com/simple-deck/e2e/commit/4b0281946f3b4da0fe7ad314b779f30b0db5d6cd))
