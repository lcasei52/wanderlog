"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface Props {
  fieldTitle: string;
  inputName: string;
  placeholder: string;
  className?: string;
}

export default function InputWithLabel({
  fieldTitle,
  inputName,
  placeholder,
  className,
}: Props) {
  const form = useFormContext();

  return (
    <FormField
      control={form.control}
      name={inputName}
      render={({ field }) => (
        <FormItem className="relative">
          <FormLabel className="text-base font-medium">{fieldTitle}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} className="h-12" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
