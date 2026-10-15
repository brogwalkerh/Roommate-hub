import {
  addDaysTo,
  compareByDue,
  describeDue,
  describeMonthlyDay,
  describePaid,
  formatBillDate,
  isDueWithin,
  isOverdue,
  nextDueDate,
  nextRecurringBill,
  ordinal,
  todayIn,
} from './schedule'

describe('todayIn', () => {
  // 2026-10-16 03:30 UTC is still Oct 15 in Los Angeles and already Oct 16 in Tokyo.
  const instant = new Date('2026-10-16T03:30:00Z')

  it('uses the household time zone', () => {
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-15')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-16')
    expect(todayIn('UTC', instant)).toBe('2026-10-16')
  })

  it('falls back to the browser zone for a missing or unknown zone', () => {
    const local = todayIn(null, instant)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(todayIn('Not/AZone', instant)).toBe(local)
  })
})

describe('addDaysTo', () => {
  it('crosses months, years and leap days', () => {
    expect(addDaysTo('2026-10-15', 7)).toBe('2026-10-22')
    expect(addDaysTo('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysTo('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysTo('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('is not thrown off by daylight-saving changes', () => {
    expect(addDaysTo('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDaysTo('2026-03-08', 1)).toBe('2026-03-09')
  })
})

describe('isOverdue / isDueWithin', () => {
  const today = '2026-10-15'
  it('flags bills due before today', () => {
    expect(isOverdue('2026-10-14', today)).toBe(true)
    expect(isOverdue('2026-10-15', today)).toBe(false)
    expect(isOverdue(null, today)).toBe(false)
  })

  it('includes overdue bills and bills due within the window', () => {
    expect(isDueWithin('2026-09-01', today, 7)).toBe(true)
    expect(isDueWithin('2026-10-15', today, 0)).toBe(true)
    expect(isDueWithin('2026-10-22', today, 7)).toBe(true)
    expect(isDueWithin('2026-10-23', today, 7)).toBe(false)
    expect(isDueWithin(null, today, 7)).toBe(false)
  })
})

describe('compareByDue', () => {
  it('sorts soonest first, no due date last, then by when added', () => {
    const bills = [
      { title: 'No date', due_on: null, created_at: '2026-10-01T00:00:00Z' },
      { title: 'Later', due_on: '2026-11-01', created_at: '2026-10-01T00:00:00Z' },
      { title: 'Soon B', due_on: '2026-10-20', created_at: '2026-10-02T00:00:00Z' },
      { title: 'Soon A', due_on: '2026-10-20', created_at: '2026-10-01T00:00:00Z' },
      { title: 'Overdue', due_on: '2026-10-01', created_at: '2026-10-05T00:00:00Z' },
    ]
    expect([...bills].sort(compareByDue).map((b) => b.title)).toEqual(['Overdue', 'Soon A', 'Soon B', 'Later', 'No date'])
  })
})

describe('describeDue', () => {
  const today = '2026-10-15'
  it.each([
    [null, 'No due date', false],
    ['2026-10-15', 'Due today', false],
    ['2026-10-16', 'Due tomorrow', false],
    ['2026-10-14', 'Overdue, due yesterday', true],
    ['2026-10-01', 'Overdue, due Thu, Oct 1', true],
    ['2026-10-23', 'Due Fri, Oct 23', false],
    ['2027-01-04', 'Due Mon, Jan 4, 2027', false],
  ])('%s -> %j', (due, label, overdue) => {
    expect(describeDue(due, today)).toEqual({ label, overdue })
  })
})

describe('describePaid / formatBillDate', () => {
  it('describes paid dates', () => {
    expect(describePaid('2026-10-15', '2026-10-15')).toBe('Paid today')
    expect(describePaid('2026-10-14', '2026-10-15')).toBe('Paid yesterday')
    expect(describePaid('2026-10-03', '2026-10-15')).toBe('Paid Sat, Oct 3')
    expect(describePaid('2025-12-31', '2026-01-02')).toBe('Paid Wed, Dec 31, 2025')
  })

  it('formats with the year only when it differs', () => {
    expect(formatBillDate('2026-11-01', '2026-10-15')).toBe('Sun, Nov 1')
    expect(formatBillDate('2027-11-01', '2026-10-15')).toBe('Mon, Nov 1, 2027')
  })
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [28, '28th'],
    [31, '31st'],
  ])('%i -> %s', (n, text) => {
    expect(ordinal(n)).toBe(text)
  })
})

describe('describeMonthlyDay', () => {
  it('reads like a person would say it', () => {
    expect(describeMonthlyDay(1)).toBe('Every month on the 1st')
    expect(describeMonthlyDay(28)).toBe('Every month on the 28th')
    expect(describeMonthlyDay(29)).toBe('Every month on the 29th, or the last day in shorter months')
    expect(describeMonthlyDay(30)).toBe('Every month on the 30th, or the last day in shorter months')
    expect(describeMonthlyDay(31)).toBe('Every month on the last day')
  })
})

describe('nextDueDate', () => {
  it.each([
    [1, '2026-10-15', '2026-11-01'],
    [15, '2026-10-15', '2026-10-15'],
    [20, '2026-10-15', '2026-10-20'],
    [31, '2026-10-15', '2026-10-31'],
    [31, '2026-11-01', '2026-11-30'],
    [30, '2027-02-10', '2027-02-28'],
    [30, '2028-02-10', '2028-02-29'],
    [29, '2027-02-28', '2027-02-28'],
    [30, '2026-10-31', '2026-11-30'],
    [1, '2026-12-02', '2027-01-01'],
  ])('day %i from %s -> %s', (day, today, due) => {
    expect(nextDueDate(day, today)).toBe(due)
  })
})

describe('nextRecurringBill', () => {
  it('adds the bill lead days before it is due', () => {
    expect(nextRecurringBill(1, 7, '2026-10-15')).toEqual({ dueOn: '2026-11-01', addedOn: '2026-10-25', addedNow: false })
    expect(nextRecurringBill(20, 7, '2026-10-15')).toEqual({ dueOn: '2026-10-20', addedOn: '2026-10-13', addedNow: true })
    expect(nextRecurringBill(1, 28, '2026-10-15')).toEqual({ dueOn: '2026-11-01', addedOn: '2026-10-04', addedNow: true })
    expect(nextRecurringBill(15, 0, '2026-10-15')).toEqual({ dueOn: '2026-10-15', addedOn: '2026-10-15', addedNow: true })
  })
})
