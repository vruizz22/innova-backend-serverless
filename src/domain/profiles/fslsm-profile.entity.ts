export interface IFslsmProfile {
  id: string;
  userId: string;
  active: number;
  sensing: number;
  visual: number;
  sequential: number;
}

export class FslsmProfile implements IFslsmProfile {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly active: number,
    public readonly sensing: number,
    public readonly visual: number,
    public readonly sequential: number,
  ) {
    this.validateDimensions();
  }

  private validateDimensions(): void {
    const dimensions = [
      this.active,
      this.sensing,
      this.visual,
      this.sequential,
    ];
    if (dimensions.some((dim) => isNaN(dim) || dim < -11 || dim > 11)) {
      throw new Error('FSLSM dimensions must be numbers between -11 and +11.');
    }
  }

  static create(props: Omit<IFslsmProfile, 'id'>): FslsmProfile {
    return new FslsmProfile(
      // Let infrastructure handle the ID generation or use a domain ID generator. To keep it simple, we pass an empty string and the DB assigns it, or we generate UUID here.
      '',
      props.userId,
      props.active,
      props.sensing,
      props.visual,
      props.sequential,
    );
  }
}
