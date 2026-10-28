import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TechCourseRestrictionDialog({
  open,
  onOpenChange,
  kind = "course",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: "course" | "quiz";
}) {
  const isQuiz = kind === "quiz";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block max-w-md overflow-hidden rounded-3xl border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 p-0 shadow-2xl">
        <div className="relative p-7 sm:p-8">
          <div className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Sparkles className="size-8" />
          </div>
          <DialogTitle className="text-center text-2xl font-bold">
            {isQuiz ? "Let’s keep the quiz techy!" : "Technology courses only"}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-3 max-w-sm text-center text-base leading-relaxed">
            {isQuiz
              ? "Pathway-SI makes quizzes about IT, coding, computers, data, and technology. Pick a tech topic and we’ll make you a fun quiz!"
              : "Pathway-SI creates courses about IT, coding, computers, data, and technology. Choose a tech topic and we’ll build a learning path for you!"}
          </DialogDescription>
          <DialogFooter className="mt-7 justify-center sm:justify-center">
            <Button
              type="button"
              variant="hero"
              className="min-w-32"
              onClick={() => onOpenChange(false)}
            >
              Got it ✨
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
