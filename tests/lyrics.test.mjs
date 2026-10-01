import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseLyricsText, parseDurationSeconds, syncedToPlainText, verifyLyricsMatch } from '../src/lyrics.ts'

const track = { title: 'Signal', artist: 'Nova, Guest', albumTitle: 'Night Study', duration: '3:20' }
const record = { id: 1, trackName: 'Signal', artistName: 'Nova', albumName: 'Night Study', duration: 200, instrumental: false, plainLyrics: 'One\nTwo', syncedLyrics: '[00:01.00]One\n[00:02.00]Two' }

test('lyrics metadata requires title, primary artist, album and duration match', () => {
  assert.equal(verifyLyricsMatch(track, record).valid, true)
  assert.equal(verifyLyricsMatch(track, { ...record, duration: 205 }).valid, false)
  assert.equal(verifyLyricsMatch(track, { ...record, albumName: 'Other' }).valid, false)
})

test('synced lyrics retain line breaks without timestamps', () => {
  assert.equal(syncedToPlainText(record.syncedLyrics), 'One\nTwo')
  assert.deepEqual(chooseLyricsText(record), { text: 'One\nTwo', synced: true })
})

test('duration parser rejects unavailable or malformed values', () => {
  assert.equal(parseDurationSeconds('3:20'), 200)
  assert.equal(parseDurationSeconds('—'), null)
})
