// Qué puede hacer cada quien con una tarea (S14). Es solo para la interfaz: RLS y el trigger
// tasks_before_write lo imponen en la base. Quien solo es responsable cambia el estado y nada más.

type Owned = { owner_id: string };

/** Eliminar: quien creó la tarea o un supervisor (igual que la política de borrado). */
export function canDelete(task: Owned, userId: string | undefined, isSupervisor: boolean): boolean {
  return !!userId && (task.owner_id === userId || isSupervisor);
}

/** Editar título, descripción, fecha, prioridad o responsable: quien la creó o un supervisor. */
export function canEditFields(task: Owned, userId: string | undefined, isSupervisor: boolean): boolean {
  return !!userId && (task.owner_id === userId || isSupervisor);
}
