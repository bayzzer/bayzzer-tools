import { ImmutableManage, IProduce } from "index"
import { IAppState } from "@types"

const manage = new ImmutableManage()
export const produce: IProduce<IAppState> = manage.produce
