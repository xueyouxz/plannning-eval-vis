## Add API Prompt

在 `{feature_name}` 中新增接口 `{api_name}`。

接口目标：{goal}
请求参数：{request_shape}
响应数据：{response_shape}

要求：
- 类型放在 feature 的 `types/`
- 请求实现放在 feature 的 `api/`
- 页面消费逻辑放在 feature 的 `hooks/`
- 共享请求能力统一走 `src/shared/lib/`
- 更新该 feature 的 `index.ts`
