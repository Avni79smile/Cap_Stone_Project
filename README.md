# Pathway AI Academy

i wnat to make a ai course gneerator porject name Pathway-SI i wnat a proper ui with lkanding page login and sign up page so when user login or sign up they should have dashboard,home, ai cours egeneewtor with animated video and quiz sections and assesmnmet like leet code and at last rpoogress and certification create the whiole porject

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2b778d1f-8473-4e3b-be9c-4eb992d796af).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## AI provider fallback

AI requests run on the server. Set provider credentials in the root `.env` file; do not expose secret keys in client-side variables such as `VITE_*`.

The backend tries the provider named by `AI_PROVIDER` first (`grok`/`groq`, `gemini`/`google`, `ollama`, or `huggingface`), then falls back to other configured providers. Groq and Gemini need their respective API key variables. Ollama uses `OLLAMA_BASE_URL` and `OLLAMA_MODEL` and must be reachable from the server. Hugging Face fallback is enabled when both `HUGGINGFACE_API_KEY` and `HUGGINGFACE_MODEL` are set. Optional model variables are `GROQ_MODEL` and `GEMINI_MODEL`.

Course generation is restricted to IT and technology topics. The server checks the request before generation and validates the generated course before saving it; non-technology topics are rejected.

Courses can be translated into a user-entered language from the course page. Translations are generated server-side with the configured AI provider fallback and saved alongside the original course; coding source and tests remain unchanged.
