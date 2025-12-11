import { motion, AnimatePresence } from "framer-motion";
import { BoundingBox } from "@/types/document";

interface HighlightOverlayProps {
  highlights: BoundingBox[];
  activeHighlight?: BoundingBox | null;
  scale?: number;
}

export function HighlightOverlay({
  highlights,
  activeHighlight,
  scale = 1,
}: HighlightOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Passive highlights */}
      {highlights.map((highlight, index) => (
        <motion.div
          key={index}
          className="absolute bg-primary/20 border border-primary/40 rounded-sm"
          style={{
            left: highlight.x * scale,
            top: highlight.y * scale,
            width: highlight.width * scale,
            height: highlight.height * scale,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      ))}

      {/* Active highlight with glow animation */}
      <AnimatePresence>
        {activeHighlight && (
          <motion.div
            className="absolute rounded-sm"
            style={{
              left: activeHighlight.x * scale,
              top: activeHighlight.y * scale,
              width: activeHighlight.width * scale,
              height: activeHighlight.height * scale,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            {/* Outer glow */}
            <motion.div
              className="absolute -inset-2 bg-primary/30 rounded-md blur-md"
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            {/* Inner highlight */}
            <div className="absolute inset-0 bg-primary/30 border-2 border-primary rounded-sm" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
