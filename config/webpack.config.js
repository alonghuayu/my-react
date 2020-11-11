'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
const PnpWebpackPlugin = require('pnp-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const safePostCssParser = require('postcss-safe-parser');
const ManifestPlugin = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const ESLintPlugin = require('eslint-webpack-plugin');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin = require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const typescriptFormatter = require('react-dev-utils/typescriptFormatter');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const postcssNormalize = require('postcss-normalize');

const appPackageJson = require(paths.appPackageJson);

// Source maps are resource heavy and can cause out of memory issue for large source files.
// 源映射占用大量资源，并且可能导致大型源文件出现内存不足的问题。
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const webpackDevClientEntry = require.resolve(
  'react-dev-utils/webpackHotDevClient'
);
const reactRefreshOverlayEntry = require.resolve(
  'react-dev-utils/refreshOverlayInterop'
);

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
// 某些应用不需要保存Web请求的好处，因此无需内联代码块
// 使构建过程更加顺畅。
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
// 检查是否设置了TypeScript
const useTypeScript = fs.existsSync(paths.appTsConfig);

// Get the path to the uncompiled service worker (if it exists).
// 获取未编译服务工作者的路径（如果存在）。
const swSrc = paths.swSrc;

// style files regexes
// 样式文件正则表达式
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// 这是生产和开发配置。
// 它着重于开发人员的经验，快速的重建和最小的捆绑。
module.exports = function (webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  // 用于在生产中启用性能分析的变量
  // 传递给别名对象。 如果传递给构建命令，则使用标志
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  // 我们将在index.html中以％PUBLIC_URL％的形式向我们的应用提供paths.publicUrlOrPath，而在JavaScript中以process.env.PUBLIC_URL的形式提供。
  // 省略尾部斜杠，因为％PUBLIC_URL％/ xyz看起来比％PUBLIC_URL％xyz好。
  // 获取环境变量以注入我们的应用程序。
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  // 获取样式加载器的常用功能
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        // css位于“ static / css”中，使用“ ../../”定位生产环境“ paths.publicUrlOrPath”中的index.html文件夹可以是相对路径
        options: paths.publicUrlOrPath.startsWith('.')
          ? { publicPath: '../../' }
          : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        // Options for PostCSS as we reference these options twice
        // Adds vendor prefixing based on your specified browser support in
        // package.json
        // 我们两次引用这些选项的PostCSS选项，根据package.json中指定的浏览器支持添加供应商前缀
        loader: require.resolve('postcss-loader'),
        options: {
          // Necessary for external CSS imports to work
          // 外部CSS导入正常工作所必需
          // https://github.com/facebook/create-react-app/issues/2677
          ident: 'postcss',
          plugins: () => [
            require('postcss-flexbugs-fixes'),
            require('postcss-preset-env')({
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3,
            }),
            // Adds PostCSS Normalize as the reset css with default options,
            // so that it honors browserslist config in package.json
            // which in turn let's users customize the target behavior as per their needs.
            // 添加PostCSS Normalize作为带有默认选项的重置CSS，以便遵循package.json中的browserslist配置，从而使用户可以根据需要自定义目标行为。
            postcssNormalize(),
          ],
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
            root: paths.appSrc,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      );
    }
    return loaders;
  };

  return {
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    // 在生产中尽早停止编译
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    // 这些是我们应用程序的“入口点”。
    // 这意味着它们将成为JS包中包含的“根”导入。
    entry:
      isEnvDevelopment && !shouldUseReactRefresh
        ? [
            // Include an alternative client for WebpackDevServer. A client's job is to
            // connect to WebpackDevServer by a socket and get notified about changes.
            // When you save a file, the client will either apply hot updates (in case
            // of CSS changes), or refresh the page (in case of JS changes). When you
            // make a syntax error, this client will display a syntax error overlay.
            // 包括WebpackDevServer的备用客户端。 客户端的工作是通过套接字连接到WebpackDevServer并获得有关更改的通知。 
            // 保存文件时，客户端将应用热更新（在CSS更改的情况下），或刷新页面（在JS更改的情况下）。 出现语法错误时，此客户端将显示语法错误覆盖。
            // Note: instead of the default WebpackDevServer client, we use a custom one
            // to bring better experience for Create React App users. You can replace
            // the line below with these two lines if you prefer the stock client:
            // 注意：我们使用默认的WebpackDevServer客户端，而不是默认的WebpackDevServer客户端，以为Create React App用户带来更好的体验。 
            // 如果您更喜欢股票客户，可以用以下两行替换下面的行：
            // require.resolve('webpack-dev-server/client') + '?/',
            // require.resolve('webpack/hot/dev-server'),
            //
            // When using the experimental react-refresh integration,
            // the webpack plugin takes care of injecting the dev client for us.
            // 当使用实验性的React-Refresh集成时，Webpack插件将为我们注入开发客户端。
            webpackDevClientEntry,
            // Finally, this is your app's code:
            // 最后，这是您的应用程序代码：
            paths.appIndexJs,
            // We include the app code last so that if there is a runtime error during
            // initialization, it doesn't blow up the WebpackDevServer client, and
            // changing JS code would still trigger a refresh.
            // 我们在最后添加了应用程序代码，以便在初始化期间出现运行时错误时，它不会使WebpackDevServer客户端崩溃，并且更改JS代码仍会触发刷新。
          ]
        : paths.appIndexJs,
    output: {
      // The build folder.构建文件夹。
      path: isEnvProduction ? paths.appBuild : undefined,
      // Add /* filename */ comments to generated require()s in the output. 在输出中将/ *文件名* /注释添加到生成的require（）中。
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      // 将有一个主包，每个异步块一个文件，在开发中不会产生实际文件。
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/bundle.js',
      // TODO: remove this when upgrading to webpack 5 待办事项：升级到Webpack 5时删除
      futureEmitAssets: true,
      // There are also additional JS chunk files if you use code splitting.如果您使用代码分割，则还有其他JS块文件。
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      // webpack使用publicPath来确定从哪里提供应用程序。它需要一个斜杠，否则文件资产将获得错误的路径。我们从首页推断出“公共路径”（例如/或/ my-project）。
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      // 将源映射条目指向原始磁盘位置（在Windows上为URL格式）
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
      // Prevents conflicts when multiple webpack runtimes (from different apps)
      // are used on the same page.
      // 防止在同一页面上使用多个Webpack运行时（来自不同应用程序）时发生冲突。
      jsonpFunction: `webpackJsonp${appPackageJson.name}`,
      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      // 默认为“窗口”，但通过将其设置为“此”，则所构建的模块块也将在Web Worker中工作。
      globalObject: 'this',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        // This is only used in production mode  仅在生产模式下使用
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              // 我们希望terser解析ecma 8代码。 但是，我们不希望它应用将有效ecma 5代码转换为无效ecma 5代码的任何缩小步骤。 这就是为什么“压缩”和“输出”部分仅应用ecma 5安全的转换的原因
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code: 由于Uglify违反了看似有效的代码的问题而被禁用：
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation: 有待进一步调查：
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code: 由于Terser破坏有效代码的问题而被禁用：
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation: 有待进一步调查：
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools 为在devtools中进行分析而添加
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // 由于使用默认设置无法正确缩小表情符号和正则表达式，因此已打开
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
          sourceMap: shouldUseSourceMap,
        }),
        // This is only used in production mode 仅在生产模式下使用
        new OptimizeCSSAssetsPlugin({
          cssProcessorOptions: {
            parser: safePostCssParser,
            map: shouldUseSourceMap
              ? {
                  // `inline: false` forces the sourcemap to be output into a
                  // separate file
                  // inline：false强制将源地图输出到单独的文件中
                  inline: false,
                  // `annotation: true` appends the sourceMappingURL to the end of
                  // the css file, helping the browser find the sourcemap
                  // `annotation：true`将sourceMappingURL附加到css文件的末尾，以帮助浏览器找到sourcemap
                  annotation: true,
                }
              : false,
          },
          cssProcessorPluginOptions: {
            preset: ['default', { minifyFontValues: { removeQuotes: false } }],
          },
        }),
      ],
      // Automatically split vendor and commons  自动分割供应商和公地
      // https://twitter.com/wSokra/status/969633336732905474
      // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
      splitChunks: {
        chunks: 'all',
        name: false,
      },
      // Keep the runtime chunk separated to enable long term caching 使运行时块保持分离以启用长期缓存
      // https://twitter.com/wSokra/status/969679223278505985
      // https://github.com/facebook/create-react-app/issues/5358
      runtimeChunk: {
        name: entrypoint => `runtime-${entrypoint.name}`,
      },
    },
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules. 这使您可以为webpack在哪里寻找模块设置后备选项。
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism. 我们将这些路径放在第二位，因为如果有任何冲突，我们希望“ node_modules”能够“获胜”。 这与节点解析机制相匹配。
      // https://github.com/facebook/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem. 这些是Node生态系统支持的合理默认值。
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see: 我们还包括JSX作为通用组件文件扩展名，以支持某些工具，尽管我们不建议您使用它，请参见：
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web. 添加了`web`扩展前缀，以更好地支持React Native Web。
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools 允许使用React DevTools进行更好的分析
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Adds support for installing with Plug'n'Play, leading to faster installs and adding
        // guards against forgotten dependencies and such.
        // 增加了对使用Plug'n'Play进行安装的支持，从而加快了安装速度，并增加了针对被遗忘的依赖项等的防护措施。
        PnpWebpackPlugin,
        // Prevents users from importing files from outside of src/ (or node_modules/). 防止用户从src /（或node_modules /）外部导入文件。
        // This often causes confusion because we only process files within src/ with babel. 这通常会引起混淆，因为我们仅使用babel处理src /中的文件。
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to, 为了解决这个问题，我们阻止您从src /中导入文件-如果您愿意，
        // please link the files into your node_modules/ and let module-resolution kick in. 请将这些文件链接到node_modules /中，让模块解析开始。
        // Make sure your source files are compiled, as they will not be processed in any way. 确保源文件已编译，因为它们不会以任何方式进行处理。
        new ModuleScopePlugin(paths.appSrc, [
          paths.appPackageJson,
          reactRefreshOverlayEntry,
        ]),
      ],
    },
    resolveLoader: {
      plugins: [
        // Also related to Plug'n'Play, but this time it tells webpack to load its loaders
        // from the current package.
        // 也与Plug'n'Play有关，但是这次它告诉webpack从当前包中加载其加载程序。
        PnpWebpackPlugin.moduleLoader(module),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: [
        // Disable require.ensure as it's not a standard language feature.
        { parser: { requireEnsure: false } },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          // “ oneOf”将遍历所有后续加载器，直到满足要求为止。 如果没有匹配的加载程序，它将退回到加载程序列表末尾的“文件”加载程序。
          oneOf: [
            // TODO: Merge this config once `image/avif` is in the mime-db  待办事项：一旦“ image / avif”在mime-db中，则合并此配置
            // https://github.com/jshttp/mime-db
            {
              test: [/\.avif$/],
              loader: require.resolve('url-loader'),
              options: {
                limit: imageInlineSizeLimit,
                mimetype: 'image/avif',
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            // “ URL”加载器的工作方式类似于“文件”加载器，不同之处在于它将小于指定限制的资产（以字节为单位）嵌入为数据URL，以避免请求。 丢失的“ test”等同于一个匹配项。
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              loader: require.resolve('url-loader'),
              options: {
                limit: imageInlineSizeLimit,
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // Process application JS with Babel.
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            // 使用Babel处理应用程序JS。预设包括JSX，Flow，TypeScript和一些ESnext功能。
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                presets: [
                  [
                    require.resolve('babel-preset-react-app'),
                    {
                      runtime: hasJsxRuntime ? 'automatic' : 'classic',
                    },
                  ],
                ],
                plugins: [
                  [
                    require.resolve('babel-plugin-named-asset-import'),
                    {
                      loaderMap: {
                        svg: {
                          ReactComponent:
                            '@svgr/webpack?-svgo,+titleProp,+ref![path]',
                        },
                      },
                    },
                  ],
                  isEnvDevelopment &&
                    shouldUseReactRefresh &&
                    require.resolve('react-refresh/babel'),
                ].filter(Boolean),
                // This is a feature of `babel-loader` for webpack (not Babel itself). 这是webpack的“ babel-loader”功能（不是Babel本身）。
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                // 它可以在./node_modules/.cache/babel-loader/目录中缓存结果，以加快重建速度。
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled 有关为何禁用cacheCompression的上下文，请参见＃6846
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Babel.
            // Unlike the application JS, we only compile the standard ES features.
            // 使用Babel处理应用程序外部的任何JS，与应用程序JS不同，我们仅编译标准的ES功能。
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    require.resolve('babel-preset-react-app/dependencies'),
                    { helpers: true },
                  ],
                ],
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                
                // Babel sourcemaps are needed for debugging into node_modules
                // code.  Without the options below, debuggers like VSCode
                // show incorrect code and set breakpoints on the wrong lines.
                // 要调试到node_modules代码，需要Babel Sourcemap。 如果没有下面的选项，VSCode之类的调试器将显示错误的代码，并在错误的行上设置断点。
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            // "postcss" loader applies autoprefixer to our CSS. “ postcss”加载程序将自动前缀应用于我们的CSS。
            // "css" loader resolves paths in CSS and adds assets as dependencies. “ css”加载程序解析CSS中的路径并将资产添加为依赖项。
            // "style" loader turns CSS into JS modules that inject <style> tags. “样式”加载程序将CSS转换为注入<style>标签的JS模块。
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            // 在生产中，我们使用MiniCSSExtractPlugin将CSS提取到文件中，但是在开发中，“样式”加载器支持CSS的热编辑。默认情况下，我们支持扩展名为.module.css的CSS模块。
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // 即使包含的软件包声称没有副作用，也不要考虑CSS导入无效代码。当webpack为此添加警告或错误时，请删除此代码。
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules) 增加了对CSS模块的支持
            // using the extension .module.css 使用扩展名.module.css
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            // Opt-in support for SASS (using .scss or .sass extensions).
            // By default we support SASS Modules with the
            // extensions .module.scss or .module.sass
            // 选择性支持SASS（使用.scss或.sass扩展名）。默认情况下，我们支持扩展名为.module.scss或.module.sass的SASS模块。
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                },
                'sass-loader'
              ),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // 即使包含的软件包声称没有副作用，也不要考虑CSS导入无效代码。当webpack为此添加警告或错误时，请删除此代码。
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules, but using SASS
            // using the extension .module.scss or .module.sass
            // 添加了对CSS模块的支持，但使用扩展名为.module.scss或.module.sass的SASS
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    getLocalIdent: getCSSModuleLocalIdent,
                  },
                },
                'sass-loader'
              ),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            // “文件”加载器确保WebpackDevServer可以提供这些资产。“导入”资产时，会获得其（虚拟）文件名。
            // 在生产中，它们将被复制到“ build”文件夹中。该加载器不使用 “测试”，这样它将捕获通过其他装载程序掉落的所有模块。
            {
              loader: require.resolve('file-loader'),
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              // 排除js文件以保持“ css”加载器正常工作，因为它会注入运行时，否则将通过“文件”加载器进行处理。还应排除html和json扩展名，以便由webpacks内部加载器进行处理。
              exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              options: {
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader. 确保在“文件”加载程序之前添加新的加载程序。
          ],
        },
      ],
    },
    plugins: [
      // Generates an `index.html` file with the <script> injected.生成一个带有<script>注入的`index.html`文件。
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            inject: true,
            template: paths.appHtml,
          },
          isEnvProduction
            ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined
        )
      ),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request.
      // 内联webpack运行时脚本。 该脚本太小，无法保证有网络请求。
      // https://github.com/facebook/create-react-app/issues/5358
      isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // Makes some environment variables available in index.html.
      // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
      // 在index.html中提供一些环境变量。public URL在index.html中以％PUBLIC_URL％的形式提供，例如：
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // It will be an empty string unless you specify "homepage"
      // in `package.json`, in which case it will be the pathname of that URL.
      // 除非您在package.json中指定“ homepage”，否则它将是一个空字符串，在这种情况下，它将是该URL的路径名。
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      // 这为未找到模块的错误提供了一些必要的上下文，例如请求资源。
      new ModuleNotFoundPlugin(paths.appPath),
      // Makes some environment variables available to the JS code, for example:使一些环境变量可用于JS代码，例如：
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      // 在生产构建期间将NODE_ENV设置为生产是绝对必要的。 否则，React将以非常慢的开发模式进行编译。
      new webpack.DefinePlugin(env.stringified),
      // This is necessary to emit hot updates (CSS and Fast Refresh): 这是发出热更新（CSS和快速刷新）所必需的：
      isEnvDevelopment && new webpack.HotModuleReplacementPlugin(),
      // Experimental hot reloading for React . 实验热重装React。
      // https://github.com/facebook/react/tree/master/packages/react-refresh
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          overlay: {
            entry: webpackDevClientEntry,
            // The expected exports are slightly different from what the overlay exports,
            // so an interop is included here to enable feedback on module-level errors.
            // 预期的导出与覆盖输出的导出略有不同，因此此处包含一个互操作以实现对模块级错误的反馈。
            module: reactRefreshOverlayEntry,
            // Since we ship a custom dev client and overlay integration,
            // the bundled socket handling logic can be eliminated.
            // 由于我们提供了自定义开发客户端和覆盖集成，因此可以消除捆绑的套接字处理逻辑。
            sockIntegration: false,
          },
        }),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // 如果您在路径中输入错误的大小写，Watcher会无法正常工作，因此我们使用一个插件在您尝试执行此操作时会打印错误。
      // See https://github.com/facebook/create-react-app/issues/240
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      // If you require a missing module and then `npm install` it, you still have
      // to restart the development server for webpack to discover it. This plugin
      // makes the discovery automatic so you don't have to restart.
      // 如果您需要一个缺少的模块，然后“ npm install”它，则仍然必须重新启动开发服务器以使webpack能够发现它。 该插件使发现自动进行，因此您无需重新启动。
      // See https://github.com/facebook/create-react-app/issues/186
      isEnvDevelopment &&
        new WatchMissingNodeModulesPlugin(paths.appNodeModules),
      isEnvProduction &&
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // both options are optional
          // 与webpackOptions.output中的相同选项相似的选项都是可选的
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      // - "entrypoints" key: Array of files which are included in `index.html`,
      //   can be used to reconstruct the HTML if necessary
      // 生成具有以下内容的资产清单文件：
      // “文件”键：将所有资产文件名映射到其对应的文件名,输出文件，以便工具无需解析就可以拾取它, `index.html`, -“ entrypoints”键：ʻindex.html`中包含的文件数组，必要时可用于重建HTML
      new ManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          };
        },
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // Moment.js是一个非常受欢迎的库，由于webpack解释其代码的方式，默认情况下会捆绑大型语言环境文件。 这是一个实际的解决方案，要求用户选择导入特定的语言环境。
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      // 如果不使用Moment.js，则可以将其删除：
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      // 生成服务工作者脚本，该脚本将预缓存并保持最新的Webpack构建中的HTML和资产。
      isEnvProduction &&
        fs.existsSync(swSrc) &&
        new WorkboxWebpackPlugin.InjectManifest({
          swSrc,
          dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
        }),
      // TypeScript type checking
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          typescript: resolve.sync('typescript', {
            basedir: paths.appNodeModules,
          }),
          async: isEnvDevelopment,
          checkSyntacticErrors: true,
          resolveModuleNameModule: process.versions.pnp
            ? `${__dirname}/pnpTs.js`
            : undefined,
          resolveTypeReferenceDirectiveModule: process.versions.pnp
            ? `${__dirname}/pnpTs.js`
            : undefined,
          tsconfig: paths.appTsConfig,
          reportFiles: [
            // This one is specifically to match during CI tests,
            // as micromatch doesn't match
            // 这是专门用于CI测试的匹配项，因为微匹配项不匹配   
            // '../cra-template-typescript/template/src/App.tsx'
            // otherwise. 除此以外
            '../**/src/**/*.{ts,tsx}',
            '**/src/**/*.{ts,tsx}',
            '!**/src/**/__tests__/**',
            '!**/src/**/?(*.)(spec|test).*',
            '!**/src/setupProxy.*',
            '!**/src/setupTests.*',
          ],
          silent: true,
          // The formatter is invoked directly in WebpackDevServerUtils during development
          // 在开发过程中直接在WebpackDevServerUtils中调用格式化程序
          formatter: isEnvProduction ? typescriptFormatter : undefined,
        }),
      new ESLintPlugin({
        // Plugin options
        extensions: ['js', 'mjs', 'jsx', 'ts', 'tsx'],
        formatter: require.resolve('react-dev-utils/eslintFormatter'),
        eslintPath: require.resolve('eslint'),
        context: paths.appSrc,
        // ESLint class options
        cwd: paths.appPath,
        resolvePluginsRelativeTo: __dirname,
        baseConfig: {
          extends: [require.resolve('eslint-config-react-app/base')],
          rules: {
            ...(!hasJsxRuntime && {
              'react/react-in-jsx-scope': 'error',
            }),
          },
        },
      }),
    ].filter(Boolean),
    // Some libraries import Node modules but don't use them in the browser.
    // Tell webpack to provide empty mocks for them so importing them works.
    // 有些库会导入Node模块，但不会在浏览器中使用它们。告诉webpack为它们提供空的模拟，以便导入它们可以工作。
    node: {
      module: 'empty',
      dgram: 'empty',
      dns: 'mock',
      fs: 'empty',
      http2: 'empty',
      net: 'empty',
      tls: 'empty',
      child_process: 'empty',
    },
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    // 关闭性能处理，因为我们通过FileSizeReporter利用了自己的提示
    performance: false,
  };
};
