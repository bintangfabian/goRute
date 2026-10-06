import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCsv } from './csv.ts'

test('parses quoted fields, BOM, and CRLF', () => {
  const text = '\ufeffstop_id,stop_name ,stop_lat\r\nA,"Halte ""Satu"", Utara",-6.2\r\nB,Dua,-6.3\r\n\r\n'
  assert.deepEqual(parseCsv(text), [
    { stop_id: 'A', stop_name: 'Halte "Satu", Utara', stop_lat: '-6.2' },
    { stop_id: 'B', stop_name: 'Dua', stop_lat: '-6.3' },
  ])
})

test('fills missing trailing columns', () => {
  assert.deepEqual(parseCsv('a,b,c\n1'), [{ a: '1', b: '', c: '' }])
})
