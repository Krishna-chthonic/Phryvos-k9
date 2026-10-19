"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Checkbox,
  Switch,
  Slider,
  Badge,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Dialog,
  DialogContent,
  DialogFooter,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
  Skeleton,
  useToast,
  Progress,
  ProgressCircle,
  EmptyStatePreset,
  ErrorState,
  LoadingState,
  ConfirmationDialog,
} from "@/components/ui";
import { Sparkles, Layers, Bell } from "lucide-react";

/**
 * Phase 7: Component Showcase & Interactive Playground
 * Tests all design system primitives across states, density tiers, and light/dark modes.
 *
 * Importers/callers: Next.js App Router (/design-system)
 * Affected API: Interactive UI testbench
 * Data schemas: Client state only
 * User instruction verbatim: "continue"
 */
export default function DesignSystemShowcasePage() {
  const { addToast } = useToast();

  // Component test states
  const [btnLoading, setBtnLoading] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [textareaValue, setTextareaValue] = React.useState("");
  const [selectValue, setSelectValue] = React.useState("frontier");
  const [checkboxChecked, setCheckboxChecked] = React.useState(true);
  const [checkboxIndeterminate, setCheckboxIndeterminate] = React.useState(false);
  const [switchActive, setSwitchActive] = React.useState(true);
  const [sliderValue, setSliderValue] = React.useState([42]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [progressVal] = React.useState(68);

  return (
    <div className="h-full overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950 p-6 md:p-10 space-y-12">
      {/* Header */}
      <div className="max-w-5xl mx-auto space-y-2 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div className="flex items-center gap-2">
          <Badge variant="success" size="sm" dot>Phase 7 Showcase</Badge>
          <Badge variant="outline" size="sm">WCAG 2.2 AA</Badge>
          <Badge variant="secondary" size="sm">Milestone 1 Complete</Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
          <Layers className="h-6 w-6 text-emerald-500" />
          Phryvos-k9 Design System Primitives
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Comprehensive component library built with pure React 19, Tailwind CSS v3 semantic tokens, full keyboard accessibility, and zero external widget dependencies for 100% ARM64 stability.
        </p>
      </div>

      <div className="max-w-5xl mx-auto space-y-12">
        {/* Buttons Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">1. Buttons & Variants</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBtnLoading(!btnLoading)}
            >
              Toggle Loading State
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <Button variant="primary" loading={btnLoading}>Primary</Button>
            <Button variant="secondary" loading={btnLoading}>Secondary</Button>
            <Button variant="outline" loading={btnLoading}>Outline</Button>
            <Button variant="ghost" loading={btnLoading}>Ghost</Button>
            <Button variant="success" loading={btnLoading}>Success</Button>
            <Button variant="warning" loading={btnLoading}>Warning</Button>
            <Button variant="destructive" loading={btnLoading}>Destructive</Button>
            <Button variant="link" loading={btnLoading}>Link Action</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <Button size="sm">Small (28px)</Button>
            <Button size="md">Medium (36px)</Button>
            <Button size="lg">Large (44px)</Button>
            <Button size="xl">Hero XL (48px)</Button>
            <Button size="icon" variant="outline"><Sparkles className="h-4 w-4" /></Button>
            <Button size="iconSm" variant="secondary"><Bell className="h-3.5 w-3.5" /></Button>
            <Button disabled>Disabled Button</Button>
          </div>
        </section>

        {/* Inputs & Form Controls */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">2. Form Inputs & Controls</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <div className="space-y-4">
              <div>
                <Label htmlFor="demo-input">Standard Text Input</Label>
                <Input
                  id="demo-input"
                  placeholder="e.g. Master Vault Encryption Key"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="demo-select">Select Primitive</Label>
                <Select
                  id="demo-select"
                  value={selectValue}
                  onChange={(e) => setSelectValue(e.target.value)}
                  className="mt-1.5"
                >
                  <option value="frontier">Claude 3.5 Sonnet (Frontier Reasoning)</option>
                  <option value="fast">Claude 3.5 Haiku (High-Speed Compaction)</option>
                  <option value="local">Ollama / Llama-3.2 (Local Offline)</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="demo-textarea">Auto-Sizing Textarea</Label>
                <Textarea
                  id="demo-textarea"
                  placeholder="Enter system prompt instructions or multi-line note..."
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Checkboxes & Indeterminate States</Label>
                <Checkbox
                  label="Enable Zero-Knowledge AES-256 Vault Encryption"
                  description="Keys never leave device RAM; envelope encrypted under PBKDF2"
                  checked={checkboxChecked}
                  onChange={(e) => setCheckboxChecked(e.target.checked)}
                />
                <Checkbox
                  label="Indeterminate State Example"
                  description="Partial selection indicator for batch file operations"
                  indeterminate={checkboxIndeterminate}
                  checked={checkboxIndeterminate}
                  onChange={() => setCheckboxIndeterminate(!checkboxIndeterminate)}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Switches & Toggles</Label>
                <Switch
                  label="Inactivity Auto-Lock (15 min)"
                  description="Automatically lock memory enclave on idle watchdog"
                  checked={switchActive}
                  onChange={(e) => setSwitchActive(e.target.checked)}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Continuous Slider ({sliderValue[0]}%)</Label>
                  <span className="text-xs font-mono text-muted-foreground">{sliderValue[0]}/100</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  value={sliderValue}
                  onValueChange={(val) => setSliderValue(val)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Badges & Status Indicators */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">3. Badges & Semantic Status</h2>
          <div className="flex flex-wrap gap-2.5 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 items-center">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ghost">Ghost</Badge>
            <Badge variant="success" dot>Vault Unlocked</Badge>
            <Badge variant="warning" dot>Approval Required</Badge>
            <Badge variant="destructive" dot>Vault Locked</Badge>
            <Badge variant="info" dot>Streaming Active</Badge>
            <Badge variant="success" size="sm">Small Tag</Badge>
            <Badge variant="secondary" size="lg">Large Milestone</Badge>
          </div>
        </section>

        {/* Overlays & Modals */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">4. Overlays, Dialogs & Menus</h2>
          <div className="flex flex-wrap gap-4 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 items-center">
            {/* Popover */}
            <Popover>
              <PopoverTrigger className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Open Popover
              </PopoverTrigger>
              <PopoverContent>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Quick Action Enclave</h4>
                  <p className="text-xs text-muted-foreground">
                    This popover auto-positions with collision boundary detection and escape dismissal.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Dropdown Menu
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>File Actions</DropdownMenuLabel>
                <DropdownMenuItem shortcut="⌘S">Save Encrypted File</DropdownMenuItem>
                <DropdownMenuItem shortcut="⌘D">Duplicate Node</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem shortcut="⇧⌘R">Restore Previous Version</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 dark:text-red-400">Purge Record</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Tooltip */}
            <Tooltip content="Procedural Web Audio synthesizer enabled (<3KB footprint)">
              <Button variant="outline" size="md">
                Hover for Tooltip
              </Button>
            </Tooltip>

            {/* Modal Dialog */}
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Launch Dialog
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent title="Zero-Knowledge Master Password" description="Enter your master passphrase to unlock encrypted SQLite vault storage.">
                <div className="space-y-4 py-2">
                  <Input type="password" placeholder="Master Key..." />
                  <p className="text-xs text-muted-foreground">Scrypt KDF N=32768 derivation will execute in-process.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button variant="primary" onClick={() => setDialogOpen(false)}>Unlock Enclave</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Drawer */}
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              Open Side Drawer
            </Button>
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} side="right" size="md">
              <DrawerHeader>
                <DrawerTitle>AI Reasoning & Artifacts</DrawerTitle>
                <DrawerDescription>Live inspectable thoughts and sandboxed canvas</DrawerDescription>
              </DrawerHeader>
              <DrawerContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This drawer utilizes hardware-accelerated transforms, trap-focus accessibility, and zero reflow during animation.
                  </p>
                  <LoadingState variant="dots" message="Agent synthesizing physics derivation..." />
                </div>
              </DrawerContent>
              <DrawerFooter>
                <Button variant="outline" onClick={() => setDrawerOpen(false)}>Dismiss</Button>
              </DrawerFooter>
            </Drawer>

            {/* Confirmation Dialog */}
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Destructive Action Dialog
            </Button>
            <ConfirmationDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Purge Sensitive Vault File?"
              description="This will permanently delete 'ncert_physics_ch4.md' and overwrite associated cryptographic chunks in SQLite. This action cannot be undone."
              confirmLabel="Purge Permanently"
              variant="destructive"
              onConfirm={() => {
                addToast({
                  title: "File Purged",
                  description: "ncert_physics_ch4.md was safely destroyed.",
                  variant: "destructive",
                });
              }}
            />

            {/* Toast Trigger */}
            <Button
              variant="outline"
              onClick={() => {
                addToast({
                  title: "Enclave Snapshot Saved",
                  description: "Full state serialized into memory queue at 2026-10-16.",
                  variant: "success",
                });
              }}
            >
              Trigger Toast Notification
            </Button>
          </div>
        </section>

        {/* Tabs & Content Containers */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">5. Tabs & Navigational Panes</h2>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="syllabus">Syllabus Constellation</TabsTrigger>
                <TabsTrigger value="audit">Forensic Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <p className="text-sm text-muted-foreground py-4">
                  Default overview pane with responsive tab panels, keyboard arrow key navigation, and ARIA selection states.
                </p>
              </TabsContent>
              <TabsContent value="syllabus">
                <p className="text-sm text-muted-foreground py-4">
                  3D Topological DAG visualization highlighting critical path bottlenecks for JEE/BITSAT prep.
                </p>
              </TabsContent>
              <TabsContent value="audit">
                <p className="text-sm text-muted-foreground py-4">
                  Zero unencrypted disk leaks detected; all 52 frontend and 60 backend phases mapped.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Feedback & Feedback States */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">6. Progress, Loading & Empty States</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-y-4">
              <h3 className="text-sm font-semibold">Linear & Radial Progress</h3>
              <Progress value={progressVal} label="FSRS Spaced Memory Retention" showLabel />
              <div className="flex justify-center pt-2">
                <ProgressCircle value={progressVal} size={72} strokeWidth={6} showLabel variant="success" />
              </div>
            </div>

            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
              <h3 className="text-sm font-semibold mb-2">Wireframe Skeleton</h3>
              <div className="space-y-2">
                <Skeleton variant="text" lines={3} />
                <div className="flex items-center gap-3 pt-2">
                  <Skeleton variant="circular" width={32} height={32} />
                  <Skeleton variant="text" lines={1} className="w-1/2" />
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
              <h3 className="text-sm font-semibold mb-2">Loading State</h3>
              <LoadingState variant="dots" message="Synchronizing P2P Vault..." description="Scanning local subnet" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
              <EmptyStatePreset
                preset="files"
                title="Vault Directory is Empty"
                description="Create a new encrypted markdown file or upload PDFs to begin indexing."
                action={<Button size="sm" variant="secondary">Create First File</Button>}
              />
            </div>
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
              <ErrorState
                variant="network"
                title="Local AI Daemon Unreachable"
                description="Unable to connect to Ollama on http://localhost:11434. Falling back to encrypted cloud frontier model."
                onRetry={() => {}}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}