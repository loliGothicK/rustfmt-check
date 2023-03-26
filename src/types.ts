export type AnnotationLevel = 'notice' | 'warning' | 'failure';

export type Conclusion = 'success' | 'failure' | 'cancelled';

export type OutputAnnotations = {
    path: string;
    start_line: number;
    end_line: number;
    start_column?: number;
    end_column?: number;
    annotation_level: AnnotationLevel;
    title: string;
    message: string;
};

export type RequestData = {
    status?: 'in_progress' | 'completed';
    conclusion?: Conclusion;
    completed_at?: string;
    owner: string;
    repo: string;
    name: string;
    check_run_id: number;
    output: {
        title: string;
        summary: string;
        text: string;
        annotations?: OutputAnnotations[];
    };
};
