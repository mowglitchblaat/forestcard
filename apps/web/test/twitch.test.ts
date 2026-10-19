// The channel's embeds: Twitch shows them only with `parent` set to the embedding page's host.

import { expect, test } from 'vite-plus/test';
import { chatUrl, playerUrl } from '../src/data/twitch.ts';

test('the player names the channel and the page host', () => {
  expect(playerUrl('localhost')).toBe(
    'https://player.twitch.tv/?channel=mowglitchblaat&parent=localhost',
  );
});

test('the chat: the page host, and the dark theme when the site is dark', () => {
  expect(chatUrl('localhost', false)).toBe(
    'https://www.twitch.tv/embed/mowglitchblaat/chat?parent=localhost',
  );
  expect(chatUrl('localhost', true)).toBe(
    'https://www.twitch.tv/embed/mowglitchblaat/chat?parent=localhost&darkpopout=',
  );
});
