import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
export function Dropdown({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: { label: string; onClick: () => void; destructive?: boolean }[];
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="dropdown-content" align="end" sideOffset={6}>
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              className={item.destructive ? "danger" : ""}
              onSelect={item.onClick}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
