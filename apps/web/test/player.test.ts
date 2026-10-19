// The player row is validated on arrival: what the site reads must have the expected shape, and a
// wrong shape is an error that names the field.

import { describe, expect, test } from 'vite-plus/test';
import { Player, twitchAvatar, twitchNickname } from '../src/data/player.ts';

const row = {
  id: 'u1',
  pseudo: 'Seazer',
  monnaie: 120,
  fragments: 3,
  twitch_id: '42',
  cree_le: 'x',
};

describe('Player', () => {
  test('keeps the fields the site reads, drops the others', () => {
    expect(Player.parse(row)).toEqual({ id: 'u1', pseudo: 'Seazer', monnaie: 120, fragments: 3 });
  });

  test('fragments may be null', () => {
    expect(Player.parse({ ...row, fragments: null }).fragments).toBeNull();
  });

  test('a wrong shape names the field', () => {
    expect(() => Player.parse({ ...row, monnaie: '120' })).toThrow(/monnaie/);
    expect(() => Player.parse({ ...row, pseudo: undefined })).toThrow(/pseudo/);
  });
});

describe('twitchAvatar', () => {
  const url = 'https://static-cdn.jtvnw.net/user-default-pictures/x.png';
  test('reads picture, else avatar_url', () => {
    expect(twitchAvatar({ picture: url, avatar_url: 'https://other.example/a.png' })).toBe(url);
    expect(twitchAvatar({ avatar_url: url })).toBe(url);
  });
  test('no picture or a malformed one: null', () => {
    expect(twitchAvatar({})).toBeNull();
    expect(twitchAvatar({ picture: 'not a url' })).toBeNull();
    expect(twitchAvatar(null)).toBeNull();
  });
});

describe('twitchNickname', () => {
  test('reads nickname, else null', () => {
    expect(twitchNickname({ nickname: 'Seazer', name: 'seazer' })).toBe('Seazer');
    expect(twitchNickname({ name: 'seazer' })).toBeNull();
    expect(twitchNickname({ nickname: '' })).toBeNull();
    expect(twitchNickname(null)).toBeNull();
  });
});
