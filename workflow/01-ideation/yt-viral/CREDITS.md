Copied from https://github.com/Jakeschincariol/youtube-agent-skill (skills/yt-viral, commit a2feb21), MIT licence (see LICENSE).
One line changed: the path to hooks.json, which lives in workflow/02-scripting/yt-script/ here.
Used by the idea check (`bun run ideas`): each competing video's views as a multiple of its channel's median
(recent uploads of the same format, long or short), and the hook formula of its title.
