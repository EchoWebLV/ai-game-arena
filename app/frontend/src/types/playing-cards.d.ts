declare module "@letele/playing-cards" {
  import type { ComponentType, SVGProps } from "react";
  type CardComponent = ComponentType<SVGProps<SVGSVGElement>>;
  export const B1: CardComponent;
  export const B2: CardComponent;
  const cards: { [key: string]: CardComponent };
  export default cards;
}
