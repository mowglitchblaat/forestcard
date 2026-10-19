// The streamer's channel, as Twitch serves it to other sites: the player and the chat embeds
// (iframes, no API, no key). Twitch shows an embed only if `parent` is the host of the page that
// embeds it: the page passes its own (location.hostname), so the same build works on localhost and
// in production.

export const CHANNEL = 'mowglitchblaat';

export const channelUrl = `https://www.twitch.tv/${CHANNEL}`;
// The chat in its own window: a way out when the embedded chat cannot sign in (third-party cookies
// blocked by the browser).
export const popoutChatUrl = `https://www.twitch.tv/popout/${CHANNEL}/chat?popout=`;

export const playerUrl = (host: string): string =>
  `https://player.twitch.tv/?${new URLSearchParams({ channel: CHANNEL, parent: host })}`;

// dark: the chat's dark theme (Twitch's `darkpopout` flag), to match the site's.
export const chatUrl = (host: string, dark: boolean): string =>
  `https://www.twitch.tv/embed/${CHANNEL}/chat?${new URLSearchParams({
    parent: host,
    ...(dark ? { darkpopout: '' } : {}),
  })}`;
