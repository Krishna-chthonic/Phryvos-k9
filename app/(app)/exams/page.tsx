import { ExamsApp } from "@/components/exams/ExamsApp";

/**
 * P6: Exams page — importers: none, this is the entry point.
 * Callers: ExamsApp component which calls /api/exam-subjects, /api/exam-subjects/:id/topics, /api/study-logs
 * Data schemas: exam_subjects, exam_topics, study_logs
 * User instruction: continue
 */
export default function ExamsPage() {
  return <ExamsApp />;
}
