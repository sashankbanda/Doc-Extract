import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface GlassButtonProps extends HTMLMotionProps<"button"> {
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md" | "lg";
}

const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    const variants = {
      default: "glass glass-hover text-foreground",
      primary: "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground glow-primary-subtle hover:glow-primary",
      ghost: "bg-transparent hover:bg-muted/50 text-foreground",
    };

    const sizes = {
      sm: "px-4 py-2 text-sm rounded-lg",
      md: "px-6 py-3 text-base rounded-xl",
      lg: "px-8 py-4 text-lg rounded-2xl",
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          "font-medium transition-all duration-300 flex items-center justify-center gap-2",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

GlassButton.displayName = "GlassButton";

export { GlassButton };
