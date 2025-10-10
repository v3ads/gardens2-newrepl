import { normalizeUnitCode, parseUnitCode, isStudentUnit } from '../units'

describe('Unit Classification System', () => {
  describe('normalizeUnitCode', () => {
    test('should normalize basic unit codes', () => {
      expect(normalizeUnitCode('101-a')).toBe('101-A')
      expect(normalizeUnitCode('  507-B  ')).toBe('507-B')
      expect(normalizeUnitCode('216')).toBe('216')
    })

    test('should handle different dash types', () => {
      expect(normalizeUnitCode('101–A')).toBe('101-A') // en dash
      expect(normalizeUnitCode('101—A')).toBe('101-A') // em dash
      expect(normalizeUnitCode('101-A')).toBe('101-A') // regular dash
    })

    test('should remove leading/trailing dashes', () => {
      expect(normalizeUnitCode('-101-A-')).toBe('101-A')
      expect(normalizeUnitCode('--216--')).toBe('216')
    })

    test('should collapse spaces', () => {
      expect(normalizeUnitCode('101   -   A')).toBe('101 - A')
      expect(normalizeUnitCode('  216  ')).toBe('216')
    })

    test('should handle empty/null values', () => {
      expect(normalizeUnitCode('')).toBe('')
      expect(normalizeUnitCode('   ')).toBe('')
    })
  })

  describe('parseUnitCode', () => {
    test('should parse student units correctly', () => {
      expect(parseUnitCode('101-A')).toEqual({
        base: '101',
        bedspace: 'A'
      })
      
      expect(parseUnitCode('507-B')).toEqual({
        base: '507',
        bedspace: 'B'
      })
      
      expect(parseUnitCode('  101  -  A  ')).toEqual({
        base: '101',
        bedspace: 'A'
      })
    })

    test('should parse non-student units correctly', () => {
      expect(parseUnitCode('216')).toEqual({
        base: '216',
        bedspace: null
      })
      
      expect(parseUnitCode('101A')).toEqual({
        base: '101A',
        bedspace: null
      })
    })

    test('should handle mixed case and different dashes', () => {
      expect(parseUnitCode('101-a')).toEqual({
        base: '101',
        bedspace: 'A'
      })
      
      expect(parseUnitCode('101–A')).toEqual({
        base: '101',
        bedspace: 'A'
      })
      
      expect(parseUnitCode('101—A')).toEqual({
        base: '101',
        bedspace: 'A'
      })
    })
  })

  describe('isStudentUnit', () => {
    test('should identify student units', () => {
      expect(isStudentUnit('101-A')).toBe(true)
      expect(isStudentUnit('507-B')).toBe(true)
      expect(isStudentUnit('101-a')).toBe(true)
      expect(isStudentUnit('101–A')).toBe(true) // en dash
      expect(isStudentUnit('101—A')).toBe(true) // em dash
      expect(isStudentUnit('  101  -  A  ')).toBe(true)
    })

    test('should identify non-student units', () => {
      expect(isStudentUnit('216')).toBe(false)
      expect(isStudentUnit('101A')).toBe(false)
      expect(isStudentUnit('507B')).toBe(false)
      expect(isStudentUnit('')).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('should handle complex unit codes', () => {
      expect(isStudentUnit('A101-B2')).toBe(true)
      expect(isStudentUnit('BLDG1-UNIT2')).toBe(true)
      expect(isStudentUnit('123-456')).toBe(true)
    })

    test('should normalize before parsing', () => {
      const unnormalized = '  101-a  '
      const parsed = parseUnitCode(unnormalized)
      expect(parsed.base).toBe('101')
      expect(parsed.bedspace).toBe('A')
    })
  })
})