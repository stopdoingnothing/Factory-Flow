import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquarePlus, Bug, Lightbulb, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { submitFeedback } from '@/lib/feedback';

// ── Severity options (plain language → internal enum) ──────────────────────────
const SEVERITY_OPTIONS = [
  { label: 'Minor inconvenience', value: 'low' as const },
  { label: 'Hard to work around', value: 'high' as const },
  { label: 'Blocking me completely', value: 'critical' as const },
];

// ── Zod schemas ────────────────────────────────────────────────────────────────
const bugSchema = z.object({
  title: z.string().min(1, 'Please enter a title'),
  severity: z.enum(['low', 'high', 'critical']),
  steps_to_reproduce: z.string().min(1, 'Please describe what you were doing'),
  actual_behaviour: z.string().min(1, 'Please describe what went wrong'),
  expected_behaviour: z.string().min(1, 'Please describe what you expected'),
});

const featureSchema = z.object({
  title: z.string().min(1, 'Please enter a title'),
  motivation: z.string().min(1, 'Please explain why this would help'),
  proposed_behaviour: z.string().min(1, 'Please describe how it should work'),
});

type BugFormValues = z.infer<typeof bugSchema>;
type FeatureFormValues = z.infer<typeof featureSchema>;

// ── Sub-forms ──────────────────────────────────────────────────────────────────
function BugForm({ onSubmit, submitting }: { onSubmit: (v: BugFormValues) => void; submitting: boolean }) {
  const form = useForm<BugFormValues>({
    resolver: zodResolver(bugSchema),
    defaultValues: { title: '', severity: 'high', steps_to_reproduce: '', actual_behaviour: '', expected_behaviour: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>Summary</FormLabel>
            <FormControl><Input placeholder="e.g. Attendance clock-in button not responding" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="severity" render={({ field }) => (
          <FormItem>
            <FormLabel>How much is this affecting you?</FormLabel>
            <FormControl>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => field.onChange(opt.value)}
                    className={`rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                      field.value === opt.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="steps_to_reproduce" render={({ field }) => (
          <FormItem>
            <FormLabel>What were you doing when it happened?</FormLabel>
            <FormControl>
              <Textarea
                placeholder={"1. I opened the attendance page\n2. I clicked the clock-in button\n3. Nothing happened"}
                rows={3}
                className="resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="actual_behaviour" render={({ field }) => (
          <FormItem>
            <FormLabel>What went wrong?</FormLabel>
            <FormControl><Textarea placeholder="The button did nothing and no error was shown" rows={2} className="resize-none" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="expected_behaviour" render={({ field }) => (
          <FormItem>
            <FormLabel>What did you expect to happen?</FormLabel>
            <FormControl><Textarea placeholder="My clock-in should have been recorded" rows={2} className="resize-none" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Sending…' : 'Submit Report'}
        </Button>
      </form>
    </Form>
  );
}

function FeatureForm({ onSubmit, submitting }: { onSubmit: (v: FeatureFormValues) => void; submitting: boolean }) {
  const form = useForm<FeatureFormValues>({
    resolver: zodResolver(featureSchema),
    defaultValues: { title: '', motivation: '', proposed_behaviour: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel>What would you like?</FormLabel>
            <FormControl><Input placeholder="e.g. Export attendance report as PDF" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="motivation" render={({ field }) => (
          <FormItem>
            <FormLabel>Why would this help you?</FormLabel>
            <FormControl><Textarea placeholder="I need to share monthly attendance summaries with payroll..." rows={3} className="resize-none" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="proposed_behaviour" render={({ field }) => (
          <FormItem>
            <FormLabel>How should it work?</FormLabel>
            <FormControl><Textarea placeholder="A button on the attendance page that generates a PDF of the filtered view..." rows={3} className="resize-none" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Sending…' : 'Submit Request'}
        </Button>
      </form>
    </Form>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [location] = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<'bug_report' | 'feature_request'>('bug_report');

  function handleClose() {
    onClose();
    // Reset after close animation
    setTimeout(() => { setSubmitted(false); setSubmitting(false); }, 300);
  }

  async function handleBugSubmit(values: BugFormValues) {
    setSubmitting(true);
    setSubmitted(true); // Show success immediately — fire-and-forget
    handleClose();
    submitFeedback({ type: 'bug_report', current_route: location, ...values }).catch(() => {});
  }

  async function handleFeatureSubmit(values: FeatureFormValues) {
    setSubmitting(true);
    setSubmitted(true);
    handleClose();
    submitFeedback({ type: 'feature_request', current_route: location, ...values }).catch(() => {});
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              Report an Issue
            </DialogTitle>
            <DialogDescription>
              Your report is sent directly to the development team.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bug_report" className="flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Bug Report
              </TabsTrigger>
              <TabsTrigger value="feature_request" className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Feature Request
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bug_report" className="mt-4">
              <BugForm onSubmit={handleBugSubmit} submitting={submitting} />
            </TabsContent>

            <TabsContent value="feature_request" className="mt-4">
              <FeatureForm onSubmit={handleFeatureSubmit} submitting={submitting} />
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground mt-2">
            Current page: <span className="font-mono">{location}</span>
          </p>
        </DialogContent>
      </Dialog>

      {/* Success confirmation (shown after submit, before close animation completes) */}
      <Dialog open={submitted && !open} onOpenChange={() => setSubmitted(false)}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <DialogTitle>Report Submitted</DialogTitle>
            <DialogDescription>
              Your report has been sent to the development team. Thank you!
            </DialogDescription>
            <Button onClick={() => setSubmitted(false)} className="mt-2">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
