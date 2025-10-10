/**
 * SyncReporter - Enhanced sync tracking with detailed stage-by-stage reporting
 * 
 * Provides granular visibility into sync operations, replacing vague error messages
 * with specific step details, success/failure status, and actionable remediation guidance.
 */

// Use timezone-aware date creation directly
const toEasternTime = (date: Date): Date => {
  // For consistency with timezone-utils approach
  const easternOffset = -5 * 60; // EST is UTC-5 
  return new Date(date.getTime() + easternOffset * 60 * 1000);
};

export interface SyncStep {
  name: string;
  category: 'ingestion' | 'processing' | 'validation';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  recordsProcessed?: number;
  metrics?: Record<string, any>;
  details?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    remediation?: string;
    stack?: string;
  };
}

export interface SyncRun {
  id: string;
  type: 'daily_auto' | 'manual' | 'recovery';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  totalRecords: number;
  initiatedBy: string;
  errorSummary?: string;
  validationsPassed: number;
  validationsFailed: number;
  isOptimized: boolean;
  warningsCount: number;
  environment: string;
  steps: SyncStep[];
}

export class SyncReporter {
  private currentRun: SyncRun | null = null;
  private steps: Map<string, SyncStep> = new Map();

  /**
   * Start a new sync run with detailed tracking
   */
  startRun(config: {
    type: SyncRun['type'];
    initiatedBy: string;
    isOptimized?: boolean;
  }): string {
    const runId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentRun = {
      id: runId,
      type: config.type,
      status: 'running',
      startedAt: toEasternTime(new Date()),
      totalRecords: 0,
      initiatedBy: config.initiatedBy,
      validationsPassed: 0,
      validationsFailed: 0,
      isOptimized: config.isOptimized ?? false,
      warningsCount: 0,
      environment: process.env.NODE_ENV || 'development',
      steps: []
    };

    this.steps.clear();
    console.log(`[SYNC_REPORTER] 🚀 Started ${config.type} sync run: ${runId}`);
    
    return runId;
  }

  /**
   * Start a new sync step with category and expected operations
   */
  startStep(name: string, category: SyncStep['category'], details?: Record<string, any>): void {
    if (!this.currentRun) {
      console.warn(`[SYNC_REPORTER] ⚠️ Cannot start step "${name}" - no active run`);
      return;
    }

    const step: SyncStep = {
      name,
      category,
      status: 'running',
      startedAt: toEasternTime(new Date()),
      recordsProcessed: 0,
      details: details || {}
    };

    this.steps.set(name, step);
    console.log(`[SYNC_REPORTER] ▶️ Step started: ${name} (${category})`);
  }

  /**
   * Update step progress with metrics
   */
  progress(stepName: string, metrics: {
    recordsProcessed?: number;
    progress?: string;
    [key: string]: any;
  }): void {
    const step = this.steps.get(stepName);
    if (!step) {
      console.warn(`[SYNC_REPORTER] ⚠️ Step "${stepName}" not found for progress update`);
      return;
    }

    if (metrics.recordsProcessed !== undefined) {
      step.recordsProcessed = metrics.recordsProcessed;
    }

    step.metrics = { ...step.metrics, ...metrics };
    console.log(`[SYNC_REPORTER] 📊 Progress: ${stepName} - ${metrics.progress || 'updated'}`);
  }

  /**
   * Mark step as successfully completed
   */
  successStep(stepName: string, finalMetrics?: Record<string, any>): void {
    const step = this.steps.get(stepName);
    if (!step) {
      console.warn(`[SYNC_REPORTER] ⚠️ Step "${stepName}" not found for success`);
      return;
    }

    step.status = 'completed';
    step.endedAt = toEasternTime(new Date());
    step.durationMs = step.startedAt && step.endedAt ? step.endedAt.getTime() - step.startedAt.getTime() : 0;
    
    if (finalMetrics) {
      step.metrics = { ...step.metrics, ...finalMetrics };
    }

    if (this.currentRun) {
      this.currentRun.totalRecords += step.recordsProcessed || 0;
    }

    console.log(`[SYNC_REPORTER] ✅ Step completed: ${stepName} (${step.durationMs}ms, ${step.recordsProcessed} records)`);
  }

  /**
   * Mark step as failed with detailed error information
   */
  failStep(stepName: string, error: {
    code: string;
    message: string;
    remediation?: string;
    stack?: string;
  }): void {
    const step = this.steps.get(stepName);
    if (!step) {
      console.warn(`[SYNC_REPORTER] ⚠️ Step "${stepName}" not found for failure`);
      return;
    }

    step.status = 'failed';
    step.endedAt = toEasternTime(new Date());
    step.durationMs = step.startedAt && step.endedAt ? step.endedAt.getTime() - step.startedAt.getTime() : 0;
    step.error = error;

    console.log(`[SYNC_REPORTER] ❌ Step failed: ${stepName} - ${error.code}: ${error.message}`);
    if (error.remediation) {
      console.log(`[SYNC_REPORTER] 💡 Remediation: ${error.remediation}`);
    }
  }

  /**
   * Record validation result
   */
  validationResult(stepName: string, passed: boolean, details: Record<string, any>): void {
    if (!this.currentRun) return;

    if (passed) {
      this.currentRun.validationsPassed++;
      this.successStep(stepName, { validationResult: 'PASSED', ...details });
    } else {
      this.currentRun.validationsFailed++;
      this.failStep(stepName, {
        code: 'VALIDATION_FAILED',
        message: `Validation failed: ${details.reason || 'Unknown reason'}`,
        remediation: details.remediation || 'Review data consistency and sync process'
      });
    }
  }

  /**
   * Complete the sync run with final status
   */
  endRun(status: 'completed' | 'failed' | 'cancelled', errorSummary?: string): SyncRun | null {
    if (!this.currentRun) {
      console.warn('[SYNC_REPORTER] ⚠️ Cannot end run - no active run');
      return null;
    }

    // Finalize all running steps
    this.steps.forEach((step, name) => {
      if (step.status === 'running') {
        if (status === 'failed') {
          this.failStep(name, {
            code: 'SYNC_ABORTED',
            message: 'Step aborted due to sync failure',
            remediation: 'Review sync process and retry'
          });
        } else if (status === 'cancelled') {
          step.status = 'skipped';
          step.endedAt = toEasternTime(new Date());
        }
      }
    });

    this.currentRun.status = status;
    this.currentRun.endedAt = toEasternTime(new Date());
    this.currentRun.durationMs = this.currentRun.endedAt ? this.currentRun.endedAt.getTime() - this.currentRun.startedAt.getTime() : 0;
    this.currentRun.errorSummary = errorSummary;
    this.currentRun.steps = Array.from(this.steps.values());

    // Count warnings
    this.currentRun.warningsCount = this.currentRun.steps.filter(s => 
      s.status === 'completed' && s.metrics?.warnings
    ).length;

    const finalRun = { ...this.currentRun };
    console.log(`[SYNC_REPORTER] 🏁 Sync run completed: ${finalRun.id} - ${status} (${finalRun.durationMs}ms)`);
    console.log(`[SYNC_REPORTER] 📈 Final stats: ${finalRun.totalRecords} records, ${finalRun.validationsPassed} validations passed, ${finalRun.validationsFailed} failed`);

    // Reset for next run
    this.currentRun = null;
    this.steps.clear();

    return finalRun;
  }

  /**
   * Get current run status with live step details
   */
  getCurrentStatus(): {
    run: SyncRun | null;
    liveSteps: SyncStep[];
    summary: {
      totalSteps: number;
      completedSteps: number;
      failedSteps: number;
      runningSteps: number;
      currentStep?: string;
    };
  } {
    const liveSteps = Array.from(this.steps.values());
    
    return {
      run: this.currentRun,
      liveSteps,
      summary: {
        totalSteps: liveSteps.length,
        completedSteps: liveSteps.filter(s => s.status === 'completed').length,
        failedSteps: liveSteps.filter(s => s.status === 'failed').length,
        runningSteps: liveSteps.filter(s => s.status === 'running').length,
        currentStep: liveSteps.find(s => s.status === 'running')?.name
      }
    };
  }

  /**
   * Generate detailed status report for UI display
   */
  generateStatusReport(): {
    lastSync: {
      date: string;
      status: string;
      recordsProcessed: number;
      duration: string;
      stepsCompleted: number;
      stepsFailed: number;
    };
    currentSync?: {
      status: string;
      currentStep: string;
      progress: string;
      stepsCompleted: number;
      totalSteps: number;
    };
    validationResults: Array<{
      name: string;
      status: 'passed' | 'failed';
      message: string;
      remediation?: string;
    }>;
    detailedSteps: Array<{
      name: string;
      category: string;
      status: string;
      duration?: string;
      recordsProcessed: number;
      error?: {
        code: string;
        message: string;
        remediation?: string;
      };
    }>;
  } {
    const current = this.getCurrentStatus();
    
    const validationResults = current.liveSteps
      .filter(s => s.category === 'validation')
      .map(s => ({
        name: s.name,
        status: s.status === 'completed' ? 'passed' as const : 'failed' as const,
        message: s.error?.message || `${s.name} validation ${s.status}`,
        remediation: s.error?.remediation
      }));

    const detailedSteps = current.liveSteps.map(s => ({
      name: s.name,
      category: s.category,
      status: s.status,
      duration: s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : undefined,
      recordsProcessed: s.recordsProcessed || 0,
      error: s.error
    }));

    return {
      lastSync: {
        date: current.run?.startedAt?.toISOString() || new Date().toISOString(),
        status: current.run?.status || 'unknown',
        recordsProcessed: current.run?.totalRecords || 0,
        duration: current.run?.durationMs ? `${(current.run.durationMs / 1000).toFixed(1)}s` : '0s',
        stepsCompleted: current.summary.completedSteps,
        stepsFailed: current.summary.failedSteps
      },
      currentSync: current.run?.status === 'running' ? {
        status: 'running',
        currentStep: current.summary.currentStep || 'Unknown',
        progress: `${current.summary.completedSteps}/${current.summary.totalSteps} steps`,
        stepsCompleted: current.summary.completedSteps,
        totalSteps: current.summary.totalSteps
      } : undefined,
      validationResults,
      detailedSteps
    };
  }
}

// Export singleton instance for global usage
export const syncReporter = new SyncReporter();