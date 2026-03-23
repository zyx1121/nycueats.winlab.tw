"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import {
  deleteOption,
  deleteOptionGroup,
  upsertOption,
  upsertOptionGroup,
} from "./actions";

type Option = { id: string; name: string; price_delta: number; sort_order: number };
type Group = {
  id: string;
  name: string;
  required: boolean;
  max_select: number;
  sort_order: number;
  item_options: Option[];
};

interface Props {
  menuItemId: string;
  groups: Group[];
}

export function OptionGroupsEditor({ menuItemId, groups }: Props) {
  const [isPending, startTransition] = useTransition();

  function addGroup() {
    startTransition(async () => {
      await upsertOptionGroup({
        menu_item_id: menuItemId,
        name: "新選項群組",
        required: true,
        max_select: 1,
        sort_order: groups.length,
      });
    });
  }

  function updateGroup(group: Group, patch: Partial<Group>) {
    startTransition(async () => {
      await upsertOptionGroup({
        id: group.id,
        menu_item_id: menuItemId,
        name: patch.name ?? group.name,
        required: patch.required ?? group.required,
        max_select: patch.max_select ?? group.max_select,
        sort_order: group.sort_order,
      });
    });
  }

  function removeGroup(id: string) {
    startTransition(async () => { await deleteOptionGroup(id); });
  }

  function addOption(group: Group) {
    startTransition(async () => {
      await upsertOption({
        group_id: group.id,
        name: "新選項",
        price_delta: 0,
        sort_order: group.item_options.length,
      });
    });
  }

  function updateOption(groupId: string, opt: Option, patch: Partial<Option>) {
    startTransition(async () => {
      await upsertOption({
        id: opt.id,
        group_id: groupId,
        name: patch.name ?? opt.name,
        price_delta: patch.price_delta ?? opt.price_delta,
        sort_order: opt.sort_order,
      });
    });
  }

  function removeOption(id: string) {
    startTransition(async () => { await deleteOption(id); });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">自訂選項</p>
        <Button type="button" size="sm" variant="outline" onClick={addGroup} disabled={isPending}>
          <PlusIcon className="size-3.5" />
          新增群組
        </Button>
      </div>

      {groups.map((group) => (
        <div key={group.id} className="border rounded-lg p-3 flex flex-col gap-3">
          {/* 群組 header */}
          <div className="flex items-center gap-2">
            <Input
              defaultValue={group.name}
              className="flex-1"
              onBlur={(e) => updateGroup(group, { name: e.target.value })}
            />
            <label className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={group.required}
                onChange={(e) => updateGroup(group, { required: e.target.checked })}
              />
              必選
            </label>
            <div className="flex items-center gap-1">
              <Label className="text-xs whitespace-nowrap">最多選</Label>
              <Input
                type="number"
                min={1}
                defaultValue={group.max_select}
                className="w-14 text-center px-1"
                onBlur={(e) => updateGroup(group, { max_select: parseInt(e.target.value) || 1 })}
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => removeGroup(group.id)}
              disabled={isPending}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </div>

          {/* 選項列表 */}
          <div className="flex flex-col gap-2">
            {group.item_options
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((opt) => (
                <div key={opt.id} className="flex items-center gap-2 pl-2">
                  <span className="text-muted-foreground text-sm w-3">·</span>
                  <Input
                    defaultValue={opt.name}
                    className="flex-1"
                    onBlur={(e) => updateOption(group.id, opt, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">+$</span>
                    <Input
                      type="number"
                      defaultValue={opt.price_delta}
                      className="w-16 text-center px-1"
                      onBlur={(e) => updateOption(group.id, opt, { price_delta: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeOption(opt.id)}
                    disabled={isPending}
                  >
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start pl-5 text-muted-foreground"
              onClick={() => addOption(group)}
              disabled={isPending}
            >
              <PlusIcon className="size-3.5" />
              新增選項
            </Button>
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">尚無自訂選項</p>
      )}
    </div>
  );
}
