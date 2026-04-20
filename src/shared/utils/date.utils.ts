export class DateUtils {
  static getUnixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
