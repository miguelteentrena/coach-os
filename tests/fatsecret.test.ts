import { describe, expect, it } from 'vitest';
import { fromDateInt, parseEntries, parseMonth, parseWeights, signature, summarize, toDateInt } from '../lib/fatsecret';

describe('FatSecret OAuth 1.0', () => {
  it('firma HMAC-SHA1 igual que el ejemplo de referencia de OAuth 1.0', () => {
    const sig = signature('GET', 'http://photos.example.net/photos', {
      file: 'vacation.jpg', size: 'original', oauth_consumer_key: 'dpf43f3p2l4k3l03', oauth_token: 'nnch734d00sl2jdk',
      oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: '1191242096', oauth_nonce: 'kllo9940pd9333jh', oauth_version: '1.0',
    }, 'kd94hf93k423kf44', 'pfkkdhi9sl3r4s00');
    expect(sig).toBe('tR3+Ty81lMeYAr/Fid0kMTYa/WM=');
  });
  it('convierte fechas date_int', () => {
    expect(toDateInt('1970-01-02')).toBe(1);
    expect(fromDateInt(toDateInt('2026-11-19'))).toBe('2026-11-19');
  });
});

describe('Diario de nutrición', () => {
  it('lee el resumen mensual (un día o varios)', () => {
    const one = parseMonth({ month: { day: { date_int: String(toDateInt('2026-11-18')), calories: '1650', protein: '120', carbohydrate: '150', fat: '60' } } });
    expect(one).toEqual([{ day: '2026-11-18', calories: 1650, protein: 120, carbs: 150, fat: 60 }]);
    expect(parseMonth({ month: { day: [{ date_int: '1', calories: '1' }, { date_int: '2', calories: '2' }] } })).toHaveLength(2);
    expect(parseMonth({ month: {} })).toEqual([]);
  });
  it('lee comidas y traduce el tipo de comida', () => {
    const m = parseEntries({ food_entries: { food_entry: { meal: 'Breakfast', food_entry_name: 'Avena', calories: '300', protein: '10', carbohydrate: '50', fat: '6' } } });
    expect(m[0]).toMatchObject({ meal: 'Desayuno', name: 'Avena', calories: 300 });
    expect(parseEntries(null)).toEqual([]);
  });
  it('lee pesos', () => {
    expect(parseWeights({ month: { day: [{ date_int: '1', weight_kg: '72.5' }] } })).toEqual([{ day: '1970-01-02', kg: 72.5, comment: null }]);
  });
  it('las medias ignoran los días sin registro (no cuentan como 0)', () => {
    const s = summarize([
      { day: 'a', calories: 2000, protein: 150, carbs: 200, fat: 60 },
      { day: 'b', calories: null, protein: null, carbs: null, fat: null },
      { day: 'c', calories: 1600, protein: 130, carbs: 160, fat: 50 },
    ]);
    expect(s.loggedDays).toBe(2);
    expect(s.calories).toBe(1800);
    expect(s.protein).toBe(140);
    expect((s.pctProtein ?? 0) + (s.pctCarbs ?? 0) + (s.pctFat ?? 0)).toBeGreaterThanOrEqual(99);
  });
});
