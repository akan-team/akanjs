interface ParkedRedirect<Node> {
  node: Node;
  location: string;
  replace: boolean;
}

//? A redirect the page on screen raises while another navigation loads waits for it: that one may replace the page,
//? and owns the history entry the redirect would replace. One that ends keeping the page lets the redirect run.
export class RscParkedRedirect<Node> {
  #parked: ParkedRedirect<Node> | null = null;

  park(redirect: ParkedRedirect<Node>): void {
    this.#parked = redirect;
  }

  clear(): void {
    this.#parked = null;
  }

  resume(stillShown: (node: Node) => boolean, navigate: (location: string, replace: boolean) => void): void {
    const parked = this.#parked;
    this.#parked = null;
    if (parked && stillShown(parked.node)) navigate(parked.location, parked.replace);
  }
}
