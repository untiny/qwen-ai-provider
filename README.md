# AI SDK - Qwen Provider

The Qwen provider for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the Qwen chat API.

## Setup

The Qwen provider is available in the `@untiny/qwen-ai-provider` module. You can install it with

```bash
npm i @untiny/qwen-ai-provider
```

## Provider Instance

You can import the default provider instance `qwen` from `@untiny/qwen-ai-provider`:

```ts
import { qwen } from '@untiny/qwen-ai-provider';
```

## Example

```ts
import { qwen } from '@untiny/qwen-ai-provider';
import { generateText, embed } from 'ai';

const { text } = await generateText({
  model: qwen('qwen-plus'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});

const { embedding } = await embed({
  model: qwen.embeddingModel('text-embedding-v4'),
  value: 'sunny day at the beach',
});

const { image } = await generateImage({
  model: qwen.imageModel('qwen-image-plus'),
  prompt: '一个在海边沙滩上的小狗',
});
```

## Documentation

Please check out the Qwen provider for more information.
