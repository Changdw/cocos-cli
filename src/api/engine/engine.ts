import { z } from 'zod';
import { description, result, title, tool } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/schema-base';

const SchemaRenderConfigResult = z.record(z.string(), z.any()).describe('Translated engine render-config.json data');
export type TRenderConfigResult = z.infer<typeof SchemaRenderConfigResult>;

export class EngineApi {

    @tool('engine-get-render-config')
    @title('Get Engine Render Config')
    @description('Get translated render-config.json data from the current engine repository for project settings rendering configuration display.')
    @result(SchemaRenderConfigResult)
    async getRenderConfig(): Promise<CommonResultType<TRenderConfigResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TRenderConfigResult> = {
            code,
            data: {},
        };

        try {
            const { Engine } = await import('../../core/engine');
            ret.data = Engine.queryLocalizedRenderConfig() as TRenderConfigResult;
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            ret.code = code;
            ret.reason = e instanceof Error ? e.message : String(e);
            console.error('get engine render config fail:', ret.reason);
        }

        return ret;
    }
}
