import * as Primitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Provider delayDuration={350}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content className="tooltip" sideOffset={7}>
            {label}
            <Primitive.Arrow className="tooltip-arrow" />
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
