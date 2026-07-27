# APIs
| File | Description | Method | URL | Bound Workflow |
|------|-------------|--------|-----|----------------|
| endpoints/player.json | Get video player + streaming data | POST | https://www.youtube.com/youtubei/v1/player?prettyPrint=false | watchVideo |
| endpoints/next.json | Get watch page (related videos, comments, metadata) | POST | https://www.youtube.com/youtubei/v1/next?prettyPrint=false | watchVideo |
| endpoints/like.json | Like/dislike a video | POST | https://www.youtube.com/youtubei/v1/like/like | likeVideo |
| endpoints/subscribe.json | Subscribe to a channel | POST | https://www.youtube.com/youtubei/v1/subscription/subscribe | subscribeChannel |
| endpoints/search.json | Search YouTube (via browser navigation) | GET | https://www.youtube.com/results?search_query=___query___ | searchVideos |
