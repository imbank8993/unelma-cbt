-- One delivery per student/exam, retained when a notification is read or deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cbt_exam_notification_deliveries (
    user_id uuid NOT NULL,
    exam_id uuid NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, exam_id)
);
ALTER TABLE public.cbt_exam_notification_deliveries ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cbt_exam_notification_deliveries (user_id, exam_id)
SELECT n.user_id, e.id FROM public.cbt_notifications n
JOIN public.cbt_exams e ON n.data->>'exam_id' = e.id::text
WHERE n.type = 'exam_available'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cbt_notifications_user_exam_available
    ON public.cbt_notifications (user_id, (data->>'exam_id')) WHERE type = 'exam_available';

COMMIT;
