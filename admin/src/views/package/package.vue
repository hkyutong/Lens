<route lang="yaml">
meta:
  title: 卡券管理
</route>

<script lang="ts" setup>
import { PACKAGE_EXCHANGE_RATE_DATE, packageUsdToCny, resolvePackageUsdPrice } from '../../../../service/src/common/constants/packageCurrency';

  import ApiApp from '@/api/modules/app';
  import ApiPackage from '@/api/modules/package';
import ApiModels from '@/api/modules/models';
import { createPackageEntitlementDraft, serializePackageEntitlementDraft } from '@/utils/packageEntitlements';
  import { IS_OPTIONS, PACKAGE_TYPE_OPTIONS } from '@/constants/index';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance, FormRules, UploadProps } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref } from 'vue';
  import { useRouter } from 'vue-router';

  const formRef = ref<FormInstance>();
  const router = useRouter();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);

  const formInline = reactive({
    name: '',
    page: 1,
    size: 10,
    status: '',
  });
  const formPackageRef = ref<FormInstance>();
  const activePackageId = ref(0);

  interface Package {
    id?: number | null;
    name?: string | null;
    des?: string | null;
    coverImg?: string | null;
    price?: number | null;
    usdPrice?: number | null;
    order?: number | null;
    status?: number | null;
    weight?: number | null;
    days?: number | null;
    model3Count: number | null;
    model4Count: number | null;
    drawMjCount: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
    appCats?: string | null;
    entitlements?: string | null;
  }

  const status = ref(0);
  const formPackage = reactive({
    name: null,
    des: null,
    coverImg: null,
    price: 0,
    usdPrice: 0,
    order: null,
    status: 0,
    weight: null,
    days: null,
    model3Count: null,
    model4Count: null,
    drawMjCount: null,
    appCats: '',
    entitlements: null as string | null,
  });

  const entitlementDraft = reactive(createPackageEntitlementDraft());
  const modelOptions = ref<Array<{ model: string; label: string }>>([]);
  const modelOptionsLoading = ref(false);
  const modelOptionsFailed = ref(false);

  async function loadPackageModelOptions() {
    modelOptionsLoading.value = true;
    modelOptionsFailed.value = false;
    try {
      const res = await ApiModels.queryPackageModelOptions();
      modelOptions.value = Array.isArray(res.data)
        ? res.data.map((model: { model: string; modelName: string; status: boolean }) => ({
            model: model.model,
            label: `${model.modelName || model.model}${model.status ? '' : '（已停用）'}`,
          }))
        : [];
    } catch {
      modelOptionsFailed.value = true;
    } finally {
      modelOptionsLoading.value = false;
    }
  }

  watch(visible, (opened) => {
    if (!opened) return;
    Object.assign(entitlementDraft, createPackageEntitlementDraft(formPackage.entitlements));
    void loadPackageModelOptions();
  });

  const rules = reactive<FormRules>({
    name: [{ required: true, message: '请填写套餐名称', trigger: 'blur' }],
    des: [{ required: true, message: '请填写套餐的详细描述', trigger: 'blur' }],
    deductionType: [{ required: true, message: '请选择扣费形式', trigger: 'change' }],
    coverImg: [{ required: true, message: '请填写或上传封面图地址', trigger: 'blur' }],
    appCats: [
      {
        required: false,
        message: '请填写套餐包含的应用，多个用逗号隔开',
        trigger: 'blur',
      },
    ],

    usdPrice: [{ required: true, type: 'number', min: 0.01, message: '请输入大于零的美元售价', trigger: 'blur' }],
    order: [{ required: true, message: '请填写套餐排序', trigger: 'blur' }],
    status: [{ required: true, message: '请选择套餐开启状态', trigger: 'change' }],
    days: [{ required: true, message: '请填写套餐有效期天数', trigger: 'blur' }],
    model3Count: [
      {
        required: true,
        message: '请填写套餐中基础模型可使用次数',
        trigger: 'blur',
      },
    ],
    model4Count: [
      {
        required: true,
        message: '请填写套餐中高级模型可使用次数',
        trigger: 'blur',
      },
    ],
    drawMjCount: [{ required: true, message: '请填写套餐中抽奖次数', trigger: 'blur' }],
  });

  const tableData = ref([]);

  // 获取分类名称列表
  async function queryCatList() {
    const res = await ApiApp.queryCats({ size: 100 });
    const { rows } = res.data;
    // 只保留 isMember 为 1 的分类，并且只保留名称
    appList.value = rows
      .filter((cat: any) => cat.isMember === 1)
      .map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        isMember: cat.isMember,
      }));
  }

  async function queryAllUserList() {
    try {
      loading.value = true;

      const res = await ApiPackage.queryAllPackage(formInline);
      loading.value = false;

      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } catch (error) {
      loading.value = false;
    }
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryAllUserList();
  }

  type Status = keyof typeof IS_OPTIONS;

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  interface AppCat {
    id: string;
    name: string;
    isMember: number;
  }

  const appList = ref<AppCat[]>([]);

  onMounted(() => {
    queryCatList();
    queryAllUserList();
  });

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    formPackage.coverImg = response.data;
  };

  async function handleDeletePackage(id: any) {
    await ApiPackage.delPackage({ id });
    ElMessage({ type: 'success', message: '删除套餐成功！' });
    queryAllUserList();
  }

  function handleUpdatePackage(row: Package) {
    formPackage.entitlements = row.entitlements ?? null;
    activePackageId.value = row.id as number;
    // 确保分类列表已加载
    if (appList.value.length === 0) {
      queryCatList();
    }

    nextTick(() => {
      // 先重置表单
      formPackageRef.value?.resetFields();
      // 然后赋值
      Object.assign(formPackage, row as any);
      formPackage.usdPrice = Number(formPackage.usdPrice);
      // 确保appCats字段正确设置
      formPackage.appCats = row.appCats || '';
      // 移除不需要的字段
      delete (formPackage as any).createdAt;
      delete (formPackage as any).updatedAt;
      delete (formPackage as any).deletedAt;
      delete (formPackage as any).id;
    });
    visible.value = true;
    formPackage.usdPrice = resolvePackageUsdPrice(row);
}

  const dialogTitle = computed(() => {
    return activePackageId.value ? '更新套餐' : '新增套餐';
  });

  const dialogButton = computed(() => {
    return activePackageId.value ? '确认更新' : '确认新增';
  });

  function handleCreatePkg() {
    formPackage.entitlements = null;
    activePackageId.value = 0;
    queryCatList();

    visible.value = true;
    // 重置表单
    nextTick(() => {
      formPackageRef.value?.resetFields();
      // 确保初始化时appCats为空字符串而不是null
      formPackage.appCats = '';
    });
  }

  function openAnnualCrami(row: Package) {
    router.push({
      path: '/package/crami',
      query: {
        packageId: String(row.id || ''),
        billingCycle: 'annual',
      },
    });
  }

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activePackageId.value = 0;
    formEl?.resetFields();
  }

  async function handlerSubmit(formEl: FormInstance | undefined) {
  formPackage.price = packageUsdToCny(Number(formPackage.usdPrice));
    formEl?.validate(async (valid) => {
      if (valid) {
        const submitData = {
          ...formPackage,
        entitlements: serializePackageEntitlementDraft(entitlementDraft),
        };

        if (activePackageId.value) {
          await ApiPackage.updatePackage({
            id: activePackageId.value,
            ...submitData,
          });
          ElMessage({ type: 'success', message: '更新套餐成功！' });
        } else {
          await ApiPackage.createPackage(submitData);
          ElMessage({ type: 'success', message: '创建新的套餐成功！' });
        }
        visible.value = false;
        queryAllUserList();
      }
    });
  }

  // 检查分类是否已被选择
  function isCategorySelected(catId: string): boolean {
    if (!formPackage.appCats || formPackage.appCats === '') return false;
    return formPackage.appCats.split(',').includes(String(catId));
  }

  // 选择分类
  function selectCategory(catId: string, catName: string): void {
    if (!formPackage.appCats || formPackage.appCats === '') {
      formPackage.appCats = String(catId);
    } else if (!formPackage.appCats.split(',').includes(String(catId))) {
      formPackage.appCats = `${formPackage.appCats},${catId}`;
    }
  }

  // 移除分类
  function removeCategory(catId: string): void {
    if (!formPackage.appCats) return;
    const appCats = formPackage.appCats.split(',');
    const index = appCats.indexOf(String(catId));
    if (index !== -1) {
      appCats.splice(index, 1);
      formPackage.appCats = appCats.join(',');
    }
  }

  // 根据ID获取分类名称
  function getCategoryNameById(catId: string): string {
    if (!catId || catId === '') return '';

    // 确保appList.value已加载
    if (appList.value.length === 0) {
      return catId; // 如果分类列表未加载，暂时返回ID
    }

    // 尝试查找匹配的分类，使用字符串比较确保类型一致
    const category = appList.value.find((item) => String(item.id) === String(catId));
    if (category) {
      return category.name;
    } else {
      console.warn('未找到对应ID的分类:', catId);
      return catId; // 如果找不到对应的分类，则返回ID本身
    }
  }
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">套餐设置</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>
            套餐分为不限时套餐和限时套餐。不限时充值积分永不过期，限时套餐在规定时间未使用完毕将清空剩余积分。
          </div>
          <div>如果充值的套餐等级高于或等于当前套餐等级，则叠加充值额度并延长会员到期时间。</div>
          <div>
            如果充值的套餐等级低于当前套餐等级，则只叠加充值额度，不延长会员到期时间也不改变会员等级。
          </div>
          请仔细阅读以上内容并合理配置，套餐有效时间设为-1即为不限时套餐。
        </div>
      </template>
      <HButton outline @click="handleCreatePkg">
        <SvgIcon name="ic:baseline-plus" />
        创建套餐
      </HButton>
    </PageHeader>
    <page-main>
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="套餐状态" prop="status">
          <el-select
            v-model="formInline.status"
            placeholder="请选择套餐状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in PACKAGE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="queryAllUserList"> 查询 </el-button>
          <el-button @click="handlerReset(formRef)"> 重置 </el-button>
        </el-form-item>
      </el-form>
    </page-main>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column fixed prop="name" label="套餐名称" width="150" />
        <el-table-column prop="order" label="排序ID" align="center" width="100" />
        <el-table-column prop="appCats" label="套餐应用" width="200" align="center">
          <template #default="scope">
            <el-tag
              v-for="appId in scope.row.appCats && scope.row.appCats !== ''
                ? scope.row.appCats.split(',').filter((id: string) => id && id !== '')
                : []"
              :key="appId"
              class="mr-1"
              size="small"
            >
              {{ getCategoryNameById(appId) }}
            </el-tag>
            <span v-if="!scope.row.appCats || scope.row.appCats === ''" class="text-gray-400">
              无分类
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="usdPrice" label="美元售价 (USD)" width="120" align="center">
          <template #default="scope">
            {{ '$' + resolvePackageUsdPrice(scope.row).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="套餐等级" width="100" align="center" />
        <el-table-column prop="status" label="套餐状态" width="100">
          <template #default="scope">
            <el-tag type="info">
              {{ IS_OPTIONS[scope.row.status as Status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="days" label="套餐有效期" width="120">
          <template #default="scope">
            {{ scope.row.days > 0 ? `${scope.row.days}天` : '永久' }}
          </template>
        </el-table-column>
        <el-table-column prop="model3Count" label="基础额度" width="100" />
        <el-table-column prop="model4Count" label="高级额度" width="100" />
        <el-table-column prop="drawMjCount" label="顶级额度" width="100" />
        <el-table-column prop="des" label="套餐描述" width="300" />
        <el-table-column prop="createdAt" label="创建时间" width="200">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="260">
          <template #default="scope">
            <el-button link type="success" size="small" @click="openAnnualCrami(scope.row)">
              发行年卡密
            </el-button>
            <el-button link type="primary" size="small" @click="handleUpdatePackage(scope.row)">
              修改套餐
            </el-button>
            <el-popconfirm
              title="确认删除此套餐么?"
              width="200"
              icon-color="red"
              @confirm="handleDeletePackage(scope.row.id)"
            >
              <template #reference>
                <el-button link type="danger" size="small"> 删除套餐 </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryAllUserList"
          @current-change="queryAllUserList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="970"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
      >
        <el-row>
          <el-col :span="24">
            <el-form-item label="模型访问范围">
              <div class="w-full">
                <el-switch v-model="entitlementDraft.modelWhitelistEnabled" active-text="仅允许所选模型" inactive-text="沿用套餐等级" />
                <el-select v-if="entitlementDraft.modelWhitelistEnabled" v-model="entitlementDraft.allowedModels" multiple filterable :loading="modelOptionsLoading" placeholder="选择此套餐可使用的模型" class="mt-2 w-full">
                  <el-option v-for="model in modelOptions" :key="model.model" :label="model.label" :value="model.model" />
                </el-select>
                <p v-if="modelOptionsFailed" class="mt-2 text-sm text-red-600">模型列表加载失败，请重试；现有选择会保留。</p>
                <p v-else-if="entitlementDraft.modelWhitelistEnabled && !modelOptionsLoading && modelOptions.length === 0" class="mt-2 text-sm text-gray-500">请先在模型配置中添加模型。</p>
                <p class="mt-2 text-sm text-gray-500">所选模型仍受套餐等级和积分余额限制。开启后未选择任何模型，表示该套餐不允许使用模型。</p>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-form-item label="上传权限">
              <el-select v-model="entitlementDraft.uploadMode" class="w-full">
                <el-option label="沿用现有规则" value="legacy" />
                <el-option label="禁止用户上传" value="disabled" />
                <el-option label="每日限额" value="limited" />
                <el-option label="不限每日次数" value="unlimited" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="entitlementDraft.uploadMode === 'limited'" :span="12">
            <el-form-item label="每天上传次数">
              <el-input-number v-model="entitlementDraft.dailyLimit" :min="1" :max="100000" :precision="0" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col v-if="entitlementDraft.uploadMode === 'limited' || entitlementDraft.uploadMode === 'unlimited'" :span="12">
            <el-form-item label="单文件上限 (MiB)">
              <el-input-number v-model="entitlementDraft.maxFileSizeMb" :min="1" :max="30" :precision="0" placeholder="沿用全局上限" class="w-full" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <p class="mb-4 text-sm text-gray-500">成功上传一次计一次，存储失败不占日额度。文件类型、全局大小和短时频控继续生效，文件最大为 30 MiB。</p>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="11">
            <el-form-item label="套餐详细名称" prop="name">
              <el-input v-model="formPackage.name" placeholder="请填写套餐名称" />
            </el-form-item>
          </el-col>
          <el-col :span="3" :offset="2">
            <el-form-item label="套餐开启状态" prop="status">
              <el-switch v-model="formPackage.status" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-form-item label="套餐等级" prop="status">
              <el-input
                v-model.number="formPackage.weight"
                type="number"
                placeholder="设置套餐等级"
              />
            </el-form-item>
          </el-col>
          <el-col :span="11">
            <el-form-item label="美元售价 (USD)" prop="usdPrice">
              <el-input
                v-model.number="formPackage.usdPrice"
                placeholder="请输入美元月价，例如 Plus 填 5"
                type="number"
              />
            </el-form-item>
          </el-col>
          <el-col :span="11" :offset="2">
            <el-form-item label="人民币参考价">
              <span>¥{{ packageUsdToCny(Number(formPackage.usdPrice) || 0).toFixed(2) }}（参考汇率日期：{{ PACKAGE_EXCHANGE_RATE_DATE }}）</span>
            </el-form-item>
          </el-col>
          <el-col :span="11">
            <el-form-item label="套餐有效时间" prop="days">
              <el-input
                v-model.number="formPackage.days"
                type="number"
                placeholder="自卡密生成之日有效天数、-1为永久"
              />
            </el-form-item>
          </el-col>
          <el-col :span="11" :offset="2">
            <el-form-item label="App分类" prop="appCats">
              <div class="category-selector">
                <!-- 已选择的分类 -->
                <div class="selected-categories mb-2 min-h-[36px] flex items-center flex-wrap">
                  <el-tag
                    v-for="catId in formPackage.appCats && formPackage.appCats !== ''
                      ? formPackage.appCats.split(',').filter((id: string) => id && id !== '')
                      : []"
                    :key="catId"
                    closable
                    class="mr-1 mb-1"
                    @close="removeCategory(catId)"
                  >
                    {{ getCategoryNameById(catId) }}
                  </el-tag>
                  <div
                    v-if="!formPackage.appCats || formPackage.appCats === ''"
                    class="text-gray-400 text-sm py-1"
                  >
                    请从下方选择分类
                  </div>
                </div>

                <!-- 分类选择区域 -->
                <div class="category-options p-2 border rounded-md max-h-40 overflow-y-auto">
                  <div class="text-sm text-gray-500 mb-2">可选分类：</div>
                  <div class="flex flex-wrap">
                    <el-tag
                      v-for="item in appList"
                      :key="item.id"
                      :class="[
                        'mr-1 mb-1 cursor-pointer',
                        isCategorySelected(String(item.id)) ? 'is-disabled' : '',
                      ]"
                      :effect="isCategorySelected(String(item.id)) ? 'plain' : 'dark'"
                      @click.stop="
                        isCategorySelected(String(item.id))
                          ? null
                          : selectCategory(String(item.id), item.name)
                      "
                    >
                      {{ item.name }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="11" :offset="2">
            <el-form-item label="设置套餐排序" prop="order">
              <el-input
                v-model.number="formPackage.order"
                type="number"
                placeholder="排序数字越大越靠前|套餐权重等级则反之"
              />
            </el-form-item>
          </el-col>

          <el-col :span="11">
            <el-form-item label="设置套餐描述" prop="des">
              <el-input
                v-model="formPackage.des"
                type="textarea"
                placeholder="请填写套餐详细介绍信息、用于对外展示、建议控制套餐价格字数以便于用户端对齐格式..."
                :rows="6"
              />
            </el-form-item>
          </el-col>

          <el-col :span="11" :offset="2">
            <el-form-item label="普通积分" prop="model3Count">
              <el-input
                v-model.number="formPackage.model3Count"
                type="number"
                placeholder="普通积分"
              />
            </el-form-item>
            <el-form-item label="高级模型积分" prop="model4Count">
              <el-input
                v-model.number="formPackage.model4Count"
                type="number"
                placeholder="高级模型积分"
              />
            </el-form-item>
            <el-form-item label="顶级额度" prop="drawMjCount">
              <el-input
                v-model.number="formPackage.drawMjCount"
                type="number"
                placeholder="顶级额度"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <span class="mr-5 flex justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>
